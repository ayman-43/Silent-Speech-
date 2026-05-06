"""
Export the VSR encoder + CTC head to ONNX, then apply ONNX Runtime INT8
static quantization. The resulting .onnx file runs on any device with ORT:
  Raspberry Pi, Jetson Nano, Android, iOS, Windows ARM, x86.

Exported graph:
  Input  : video  (1, 1, T, 88, 88)  -- grayscale 88x88 mouth crop, 25fps
  Output : ctc_log_probs  (1, T', V) -- log-softmax over 5002-token vocabulary

Then greedy CTC decode -> transcript.  No beam search, no decoder.

Usage:
  python export_onnx.py \
    --model-path ../slient-speech/benchmarks/LRS3/models/LRS3_V_WER19.1/model.pth \
    --model-conf ../slient-speech/benchmarks/LRS3/models/LRS3_V_WER19.1/model.json \
    --out encoder_ctc.onnx
    

  # with INT8 quantization (smaller + faster on CPU)
  python export_onnx.py ... --quantize
"""

import argparse
import json
import os
import sys
import torch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'slient-speech'))


class FullPipelineONNX(torch.nn.Module):
    """
    Full VSR inference pipeline: raw video -> CTC log probs.

    Input  : (1, 1, T, 88, 88) float32  -- grayscale mouth crops at 25fps
    Output : (1, T', V)         float32  -- log-softmax over vocabulary

    Internally: Conv3D ResNet frontend -> 12-layer Transformer encoder -> CTC projection.
    Decoder is dropped (not needed for greedy CTC decode).
    """
    def __init__(self, model):
        super().__init__()
        self.encoder = model.encoder   # includes Conv3D frontend
        self.ctc_lo = model.ctc.ctc_lo

    def forward(self, video):
        # video: (1, 1, T, 88, 88) -- single clip, grayscale
        enc_out, _ = self.encoder(video, None)  # (1, T', 768)
        logits = self.ctc_lo(enc_out)           # (1, T', V)
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
    model.load_state_dict(torch.load(model_path, map_location='cpu', weights_only=False))
    model.eval()
    return model, token_list


def export(model_path, model_conf, out_path, T=75):
    """
    T: number of video frames to use as dummy input (75 = 3s at 25fps).
    The exported model supports any T via dynamic axes.
    """
    print('[onnx] Loading model...')
    model, token_list = load_model(model_path, model_conf)
    wrapper = FullPipelineONNX(model).eval()

    # (B=1, C=1 grayscale, T frames, H=88, W=88)
    dummy_video = torch.randn(1, 1, T, 88, 88)

    print(f'[onnx] Tracing with dummy input shape: {list(dummy_video.shape)}')
    print(f'[onnx] Exporting to {out_path} ...')
    try:
        torch.onnx.export(
            wrapper,
            dummy_video,
            out_path,
            input_names=['video'],
            output_names=['ctc_log_probs'],
            dynamic_axes={
                'video':         {2: 'num_frames'},
                'ctc_log_probs': {1: 'time_out'},
            },
            opset_version=17,
            do_constant_folding=True,
            dynamo=False,  # use legacy TorchScript tracing — avoids dynamo emoji crash on Windows
        )
        mb = os.path.getsize(out_path) / 1e6
        print(f'[onnx] Export OK: {mb:.0f} MB  ({out_path})')
        return True
    except Exception as e:
        import traceback
        print(f'[onnx] Export failed: {e}')
        traceback.print_exc()
        return False


def verify_onnx(onnx_path, T=75):
    """Run a quick sanity check with onnxruntime."""
    try:
        import onnxruntime as ort
        import numpy as np
    except ImportError:
        print('[onnx] onnxruntime not installed, skipping verification')
        return

    print(f'[onnx] Verifying with ORT...')
    sess = ort.InferenceSession(onnx_path, providers=['CPUExecutionProvider'])
    dummy = np.random.randn(1, 1, T, 88, 88).astype(np.float32)
    out = sess.run(['ctc_log_probs'], {'video': dummy})[0]
    print(f'[onnx] ORT output shape: {list(out.shape)}  (expected [1, T\', 5002])')
    print('[onnx] Verification PASSED')


def quantize_onnx(onnx_path, out_path):
    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType
    except ImportError:
        print('[onnx] onnxruntime not installed. Run: pip install onnxruntime')
        return

    import tempfile, shutil

    print(f'[onnx] Applying INT8 dynamic quantization -> {out_path}')
    try:
        # Copy model to a temp dir first — avoids Windows file-lock bug where
        # ORT creates '{stem}-inferred.onnx' and then can't delete it while open.
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_in = os.path.join(tmpdir, 'model.onnx')
            tmp_out = os.path.join(tmpdir, 'model_int8.onnx')
            shutil.copy2(onnx_path, tmp_in)
            quantize_dynamic(tmp_in, tmp_out, weight_type=QuantType.QInt8)
            shutil.copy2(tmp_out, out_path)

        orig_mb = os.path.getsize(onnx_path) / 1e6
        out_mb = os.path.getsize(out_path) / 1e6
        print(f'[onnx] INT8 quantized: {orig_mb:.0f} MB -> {out_mb:.0f} MB  ({orig_mb/out_mb:.1f}x)')
    except Exception as e:
        import traceback
        print(f'[onnx] Quantization failed: {e}')
        traceback.print_exc()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-path', required=True)
    parser.add_argument('--model-conf', required=True)
    parser.add_argument('--out', default='encoder_ctc.onnx')
    parser.add_argument('--quantize', action='store_true',
                        help='Apply INT8 dynamic quantization after export')
    parser.add_argument('--verify', action='store_true', default=True,
                        help='Verify output with onnxruntime after export (default: on)')
    parser.add_argument('--frames', type=int, default=75,
                        help='Dummy frame count for tracing (default 75 = 3s at 25fps)')
    args = parser.parse_args()

    ok = export(args.model_path, args.model_conf, args.out, T=args.frames)
    if not ok:
        return

    if args.verify:
        verify_onnx(args.out, T=args.frames)

    if args.quantize:
        q_out = args.out.replace('.onnx', '_int8.onnx')
        quantize_onnx(args.out, q_out)
        if args.verify:
            verify_onnx(q_out, T=args.frames)

    print()
    print('[onnx] Files produced:')
    for f in [args.out, args.out.replace('.onnx', '_int8.onnx') if args.quantize else None]:
        if f and os.path.exists(f):
            print(f'  {f}  ({os.path.getsize(f)/1e6:.0f} MB)')
    print()
    print('[onnx] Load at inference:')
    print('  import onnxruntime as ort, numpy as np')
    print(f'  sess = ort.InferenceSession("{args.out}", providers=["CPUExecutionProvider"])')
    print('  # video: (1, 1, T, 88, 88) float32 numpy array')
    print('  log_probs = sess.run(["ctc_log_probs"], {"video": video})[0]')


if __name__ == '__main__':
    main()
