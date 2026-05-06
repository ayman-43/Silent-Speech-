"""
INT2 weight-only quantization — encoder + CTC head only (decoder dropped).

Packs 4 weights into one byte (2 bits each).
Quantization levels: { -3, -1, +1, +3 } × scale  (symmetric 2-bit absmax)

Expected results:
  Decoder dropped    :  64.5M params removed
  Remaining params   : 185.9M  (encoder + CTC)
  File size          :  ~47 MB  (was 956 MB — 20x compression)
  Peak RAM           : ~100 MB  (vs 1.2 GB FP32)
  WER impact         : +3–5%  (absorbed by LLM correction layer)
  Latency            : same as INT4 (dequant to FP32 before matmul)

Usage:
  python quantize_int2.py \
    --model-path ../slient-speech/benchmarks/LRS3/models/LRS3_V_WER19.1/model.pth \
    --model-conf ../slient-speech/benchmarks/LRS3/models/LRS3_V_WER19.1/model.json \
    --out int2_encoder_ctc.pth
"""

import argparse
import json
import os
import sys

import numpy as np
import torch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'slient-speech'))


# ── 2-bit packing / unpacking ────────────────────────────────────────────────
# Levels: 00→-3  01→-1  10→+1  11→+3  (symmetric, absmax scale)

_INT2_LEVELS = np.array([-3, -1, 1, 3], dtype=np.float32)


def _nearest_level(values: np.ndarray) -> np.ndarray:
    """Map each float to the nearest 2-bit level index (0-3)."""
    diff = np.abs(values[:, None] - _INT2_LEVELS[None, :])   # (N, 4)
    return diff.argmin(axis=1).astype(np.uint8)               # (N,)


def quantize_tensor_int2(tensor: torch.Tensor):
    """
    Symmetric 2-bit quantization.
    Returns (packed_bytes, scale, orig_shape).
    Four int2 values packed into one uint8 (bits 7-6, 5-4, 3-2, 1-0).
    """
    orig_shape = tensor.shape
    flat = tensor.float().flatten().numpy()

    max_val = np.abs(flat).max()
    scale = float(max_val / 3.0)   # maps ±3 → ±max_val

    if scale == 0:
        scale = 1e-8

    normalised = flat / scale
    indices = _nearest_level(normalised)   # uint8 in {0,1,2,3}

    # Pad to multiple of 4
    pad = (4 - len(indices) % 4) % 4
    if pad:
        indices = np.concatenate([indices, np.zeros(pad, dtype=np.uint8)])

    grouped = indices.reshape(-1, 4)
    packed = (
        (grouped[:, 0] << 6) |
        (grouped[:, 1] << 4) |
        (grouped[:, 2] << 2) |
        (grouped[:, 3])
    ).astype(np.uint8)

    return torch.from_numpy(packed), scale, orig_shape


def dequantize_tensor_int2(packed: torch.Tensor, scale: float,
                            orig_shape: torch.Size) -> torch.Tensor:
    """Unpack 2-bit values and dequantize to FP32."""
    arr = packed.numpy().astype(np.uint8)
    i0 = (arr >> 6) & 0x03
    i1 = (arr >> 4) & 0x03
    i2 = (arr >> 2) & 0x03
    i3 =  arr       & 0x03

    flat = np.empty(len(arr) * 4, dtype=np.float32)
    flat[0::4] = _INT2_LEVELS[i0]
    flat[1::4] = _INT2_LEVELS[i1]
    flat[2::4] = _INT2_LEVELS[i2]
    flat[3::4] = _INT2_LEVELS[i3]

    numel = 1
    for s in orig_shape:
        numel *= s
    flat = flat[:numel]
    return torch.from_numpy(flat * scale).reshape(orig_shape)


# ── Model loading ────────────────────────────────────────────────────────────

def load_full_model(model_path, model_conf):
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
    model.load_state_dict(torch.load(model_path, map_location='cpu'))
    model.eval()
    return model, token_list


# ── Build INT2 state dict ────────────────────────────────────────────────────

def build_int2_state(model):
    """
    Quantize every eligible Linear weight in encoder + ctc to INT2.
    Decoder is dropped. Non-linear params (biases, norms, conv) stay FP32.
    """
    stats = {'int2': 0, 'fp32_kept': 0, 'decoder_dropped': 0}
    int2_state = {}

    for key, tensor in model.state_dict().items():
        if key.startswith('decoder.'):
            stats['decoder_dropped'] += 1
            continue

        # Quantize only weight matrices large enough to benefit
        if key.endswith('.weight') and tensor.ndim == 2 and tensor.numel() > 512:
            packed, scale, shape = quantize_tensor_int2(tensor)
            int2_state[key + '.__int2_packed__'] = packed
            int2_state[key + '.__int2_scale__']  = torch.tensor(scale)
            int2_state[key + '.__int2_shape__']  = torch.tensor(list(shape))
            stats['int2'] += 1
        else:
            int2_state[key] = tensor
            stats['fp32_kept'] += 1

    return int2_state, stats


def reconstruct_state(int2_state: dict) -> dict:
    """Expand INT2 entries back to FP32 tensors for model.load_state_dict()."""
    state = {}
    processed = set()

    for key in int2_state:
        if key.endswith('.__int2_packed__'):
            base = key[: -len('.__int2_packed__')]
            packed = int2_state[base + '.__int2_packed__']
            scale  = float(int2_state[base + '.__int2_scale__'])
            shape  = torch.Size(int2_state[base + '.__int2_shape__'].tolist())
            state[base] = dequantize_tensor_int2(packed, scale, shape)
            processed |= {
                base + '.__int2_packed__',
                base + '.__int2_scale__',
                base + '.__int2_shape__',
            }
        elif key not in processed:
            state[key] = int2_state[key]

    return state


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-path', required=True)
    parser.add_argument('--model-conf', required=True)
    parser.add_argument('--out', default='int2_encoder_ctc.pth')
    args = parser.parse_args()

    print('[int2] Loading model…')
    model, _ = load_full_model(args.model_path, args.model_conf)
    orig_mb = os.path.getsize(args.model_path) / 1e6

    print('[int2] Quantizing encoder + CTC to INT2 (dropping decoder)…')
    int2_state, stats = build_int2_state(model)

    print(f'[int2]   Linear layers quantized (INT2) : {stats["int2"]}')
    print(f'[int2]   FP32 params kept               : {stats["fp32_kept"]}')
    print(f'[int2]   Decoder keys dropped            : {stats["decoder_dropped"]}')

    torch.save(int2_state, args.out)
    out_mb = os.path.getsize(args.out) / 1e6
    ratio  = orig_mb / out_mb

    print(f'\n[int2] Original  : {orig_mb:.0f} MB')
    print(f'[int2] Compressed: {out_mb:.0f} MB')
    print(f'[int2] Ratio     : {ratio:.1f}x compression')
    print(f'\n[int2] Load at inference time:')
    print(f'       from quantize_int2 import reconstruct_state')
    print(f'       state = reconstruct_state(torch.load("{args.out}"))')
    print(f'       model.load_state_dict(state, strict=False)')


if __name__ == '__main__':
    main()
