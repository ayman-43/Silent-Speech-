"""
Edge-optimised inference pipeline.

Modes (--mode):

  ctc      CTC greedy — no beam search. 10x faster, +2–4% WER.
  int8     INT8 dynamic quantised model. 4x smaller, 2–3x faster CPU.
  int2     INT2 quantised model (run quantize_int2.py first).
           20x compression (~47 MB), +3–5% WER.
  fp16     FP16 half-precision (GPU only).

Usage:
  python pipeline_edge.py --mode int2 \
    --config-path ../slient-speech/configs/LRS3_V_WER19.1.ini \
    --video path/to/clip.mp4 \
    --compressed-model int2_encoder_ctc.pth
"""

import os
import sys
import json
import argparse
import time
import torch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'slient-speech'))

from pipelines.pipeline import InferencePipeline
from pipelines.data.data_module import AVSRDataLoader
from configparser import ConfigParser


# ── CTC greedy decoder ──────────────────────────────────────────────────────

def ctc_greedy_decode(ctc_logits, token_list):
    """
    Pure CTC greedy: argmax over time, collapse repeats, remove blank.
    O(T * vocab) vs O(T * beam * vocab) for attention beam search.
    """
    ids = ctc_logits.argmax(dim=-1).squeeze(0).tolist()
    blank = 0
    collapsed = []
    prev = None
    for t in ids:
        if t != prev:
            if t != blank:
                collapsed.append(t)
            prev = t
    tokens = [token_list[i] for i in collapsed]
    text = ''.join(tokens).replace('▁', ' ').strip().replace('<eos>', '')
    return text


# ── Edge pipeline ────────────────────────────────────────────────────────────

class EdgePipeline:
    def __init__(self, config_path, mode='ctc', compressed_model_path=None,
                 device_str='cpu', detector='mediapipe'):
        self.mode = mode
        config = ConfigParser()
        config.read(config_path)

        modality = config.get('input', 'modality')
        input_v_fps = config.getfloat('input', 'v_fps')
        model_v_fps = config.getfloat('model', 'v_fps')
        model_path = config.get('model', 'model_path')
        model_conf = config.get('model', 'model_conf')

        self.device = torch.device(device_str)

        with open(model_conf) as f:
            confs = json.load(f)
        args_dict = confs if isinstance(confs, dict) else confs[2]

        import argparse as _ap
        train_args = _ap.Namespace(**args_dict)
        labels_type = getattr(train_args, 'labels_type', 'char')

        if labels_type == 'char':
            self.token_list = train_args.char_list
        elif labels_type == 'unigram5000':
            units_path = os.path.join(
                os.path.dirname(__file__), '..', 'slient-speech',
                'pipelines', 'tokens', 'unigram5000_units.txt'
            )
            self.token_list = ['<blank>'] + [
                w.split()[0] for w in open(units_path, encoding='utf-8').read().splitlines()
            ] + ['<eos>']

        from espnet.nets.pytorch_backend.e2e_asr_transformer import E2E
        self.model = E2E(len(self.token_list), train_args)

        load_path = compressed_model_path if compressed_model_path else model_path

        if mode == 'int8':
            self.model = torch.quantization.quantize_dynamic(
                self.model, {torch.nn.Linear}, dtype=torch.qint8
            )
            self.model.load_state_dict(
                torch.load(load_path, map_location='cpu'), strict=False
            )
        elif mode == 'fp16':
            state = torch.load(load_path, map_location=self.device)
            self.model.load_state_dict(state)
            self.model = self.model.half()
        elif mode == 'int2':
            # Dequantize INT2 weights back to FP32 then load
            from quantize_int2 import reconstruct_state
            int2_state = torch.load(load_path, map_location='cpu')
            fp32_state = reconstruct_state(int2_state)
            self.model.load_state_dict(fp32_state, strict=False)
        else:
            state = torch.load(load_path, map_location=self.device)
            self.model.load_state_dict(state)

        self.model.to(self.device).eval()

        self.dataloader = AVSRDataLoader(
            modality, speed_rate=input_v_fps / model_v_fps, detector=detector
        )

        from pipelines.detectors.mediapipe.detector import LandmarksDetector
        self.landmarks_detector = LandmarksDetector()

    @torch.no_grad()
    def infer(self, video_path):
        landmarks = self.landmarks_detector(video_path)
        data = self.dataloader.load_data(video_path, landmarks)

        if self.mode == 'fp16' and data.is_floating_point():
            data = data.half()

        data = data.to(self.device)

        if self.mode == 'ctc':
            # Encode only — skip the attention decoder entirely
            enc = self.model.encode(data)
            ctc_logits = self.model.ctc.ctc_lo(enc)  # (1, T, vocab)
            transcript = ctc_greedy_decode(ctc_logits, self.token_list)
            return transcript
        else:
            enc = self.model.encode(data)
            from espnet.nets.batch_beam_search import BatchBeamSearch
            from espnet.nets.scorers.length_bonus import LengthBonus
            scorers = self.model.scorers()
            scorers['length_bonus'] = LengthBonus(len(self.token_list))
            weights = {'decoder': 0.7, 'ctc': 0.3, 'length_bonus': 0.0}
            sos = eos = len(self.token_list) - 1
            beam = BatchBeamSearch(
                beam_size=4,
                vocab_size=len(self.token_list),
                weights=weights,
                scorers=scorers,
                sos=sos, eos=eos,
                token_list=self.token_list,
                pre_beam_score_key='decoder',
            ).to(self.device).eval()
            hyps = beam(enc)
            from espnet.asr.asr_utils import add_results_to_json
            text = add_results_to_json([hyps[0].asdict()], self.token_list)
            return text.replace('▁', ' ').strip().replace('<eos>', '')


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['ctc', 'int8', 'int2', 'fp16'], default='ctc')
    parser.add_argument('--config-path', required=True)
    parser.add_argument('--video', required=True)
    parser.add_argument('--compressed-model', default=None,
                        help='Path to int8/fp16 checkpoint (omit to use config path)')
    parser.add_argument('--device', default='cpu')
    args = parser.parse_args()

    print(f'[edged] Mode: {args.mode.upper()}  Device: {args.device}')
    pipeline = EdgePipeline(
        config_path=args.config_path,
        mode=args.mode,
        compressed_model_path=args.compressed_model,
        device_str=args.device,
    )

    t0 = time.perf_counter()
    transcript = pipeline.infer(args.video)
    elapsed = time.perf_counter() - t0

    print(f'[edged] Transcript : {transcript}')
    print(f'[edged] Latency    : {elapsed*1000:.0f} ms')


if __name__ == '__main__':
    main()
