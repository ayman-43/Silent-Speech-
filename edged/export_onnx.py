"""
Export the VSR encoder + CTC head to ONNX, then apply ONNX Runtime INT8
static quantization. The resulting .onnx file runs on any device with ORT:
  Raspberry Pi, Jetson Nano, Android, iOS, Windows ARM, x86 — all with the
  same file.

Exported graph:
  Input  : video_features  (1, T, 256)  — preprocessed mouth-crop sequence
  Output : ctc_log_probs   (1, T', V)   — log-softmax over vocabulary

Then greedy CTC decode → transcript.  No beam search, no decoder.

Requirements:
  pip install onnx onnxruntime

Usage:
  python export_onnx.py \
    --model-path ../slient-speech/benchmarks/LRS3/models/LRS3_V_WER19.1/model.pth \
    --model-conf ../slient-speech/benchmarks/LRS3/models/LRS3_V_WER19.1/model.json \
    --out encoder_ctc.onnx \
    --quantize          # apply ORT INT8 static quantization after export
"""

import argparse
import json
import os
import sys
import torch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'slient-speech'))


class EncoderCTCWrapper(torch.nn.Module):
    """Thin wrapper: encoder forward + CTC linear projection. No decoder."""
    def __init__(self, model):
        super().__init__()
        self.encoder = model.encoder
        self.ctc_lo = model.ctc.ctc_lo

    def forward(self, xs_pad, ilens):
        # xs_pad: (B, T, d)   ilens: (B,)
        enc_out, _, _ = self.encoder(xs_pad, ilens)
        logits = self.ctc_lo(enc_out)          # (B, T', V)
        return torch.log_softmax(logits, dim=-1)


def load_model(model_path, model_conf):
    with open(model_conf) as f:
        confs = json.load(f)
    args_dict = confs if isinstance(confs, dict) else confs[2]
    import argparse as _ap
    train_args = _ap.Namespace(**args_dict)

    units = os.path.join(os.path.dirname(__file__), '..', 'slient-speech',
                         'pipelines', 'tokens', 'unigram5000_units.txt')
    token_list = ['<blank>'] + [
        w.split()[0] for w in open(units, encoding='utf-8').read().splitlines()
    ] + ['<eos>']

    from espnet.nets.pytorch_backend.e2e_asr_transformer import E2E
    model = E2E(len(token_list), train_args)
    state = torch.load(model_path, map_location='cpu')
    model.load_state_dict(state)
    model.eval()
    return model, token_list


def export(model_path, model_conf, out_path, seq_len=300):
    print('[onnx] Loading model…')
    model, token_list = load_model(model_path, model_conf)
    wrapper = EncoderCTCWrapper(model).eval()

    # Dummy input: (1, T, adim) — adim is the encoder input dim
    # The encoder input after the conv3d frontend has dim 256
    adim = 256
    dummy_xs = torch.randn(1, seq_len, adim)
    dummy_ilens = torch.tensor([seq_len])

    print(f'[onnx] Exporting to {out_path} …')
    try:
        torch.onnx.export(
            wrapper,
            (dummy_xs, dummy_ilens),
            out_path,
            input_names=['video_features', 'input_lengths'],
            output_names=['ctc_log_probs'],
            dynamic_axes={
                'video_features': {1: 'time'},
                'ctc_log_probs':  {1: 'time_out'},
            },
            opset_version=17,
            do_constant_folding=True,
        )
        mb = os.path.getsize(out_path) / 1e6
        print(f'[onnx] Exported: {mb:.0f} MB')
        return True
    except Exception as e:
        print(f'[onnx] Export failed: {e}')
        print('[onnx] Tip: some custom ops may need opset_version tweaks.')
        return False


def quantize_onnx(onnx_path, out_path):
    try:
        from onnxruntime.quantization import quantize_static, QuantType, CalibrationDataReader
        import onnxruntime as ort
    except ImportError:
        print('[onnx] onnxruntime not installed. Run: pip install onnxruntime')
        return

    class DummyCalibration(CalibrationDataReader):
        """Minimal calibration — 10 random sequences."""
        def __init__(self):
            self._data = [
                {'video_features': torch.randn(1, 200, 256).numpy(),
                 'input_lengths': [200]}
                for _ in range(10)
            ]
            self._idx = 0

        def get_next(self):
            if self._idx >= len(self._data):
                return None
            d = self._data[self._idx]
            self._idx += 1
            return d

    print(f'[onnx] Applying INT8 static quantization → {out_path}')
    try:
        quantize_static(
            onnx_path,
            out_path,
            calibration_data_reader=DummyCalibration(),
            quant_type=QuantType.QInt8,
        )
        orig_mb = os.path.getsize(onnx_path) / 1e6
        out_mb = os.path.getsize(out_path) / 1e6
        print(f'[onnx] INT8 quantized: {orig_mb:.0f} MB → {out_mb:.0f} MB')
    except Exception as e:
        print(f'[onnx] Quantization failed: {e}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-path', required=True)
    parser.add_argument('--model-conf', required=True)
    parser.add_argument('--out', default='encoder_ctc.onnx')
    parser.add_argument('--quantize', action='store_true',
                        help='Apply ORT INT8 static quantization after export')
    args = parser.parse_args()

    ok = export(args.model_path, args.model_conf, args.out)
    if ok and args.quantize:
        q_out = args.out.replace('.onnx', '_int8.onnx')
        quantize_onnx(args.out, q_out)


if __name__ == '__main__':
    main()
