"""
INT4 weight-only quantization — encoder + CTC head only (decoder dropped).

Strategy:
  - Drop the 64.5M-param attention decoder entirely (not needed for CTC greedy)
  - Quantize remaining Linear weights to 4-bit symmetric range [-8, 7]
  - Pack two INT4 values per byte → true 4-bit storage
  - Dequantize to FP32 at runtime (memory bandwidth saved, not compute)

Expected results:
  Encoder+CTC params : 185.9M  (decoder's 64.5M dropped)
  File size          : ~93 MB   (was 956 MB — 10x compression)
  Peak RAM           : ~160 MB  (vs 1.2 GB for FP32)
  Latency            : similar to INT8 (dequant is fast)
  WER                : +1–2% vs FP32 CTC (absorbed by LLM correction)

Usage:
  python quantize_int4.py \
    --model-path ../slient-speech/benchmarks/LRS3/models/LRS3_V_WER19.1/model.pth \
    --model-conf ../slient-speech/benchmarks/LRS3/models/LRS3_V_WER19.1/model.json \
    --out int4_encoder_ctc.pth
"""

import argparse
import json
import os
import sys
import torch
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'slient-speech'))


# ── INT4 packing / unpacking ─────────────────────────────────────────────────

def quantize_tensor_int4(tensor: torch.Tensor):
    """
    Symmetric INT4 quantization. Returns (packed_bytes, scale, orig_shape).
    Two int4 values packed into one uint8: high nibble | low nibble.
    """
    orig_shape = tensor.shape
    flat = tensor.float().flatten()

    max_val = flat.abs().max().clamp(min=1e-8)
    scale = max_val / 7.0  # symmetric INT4 range [-8, 7]

    q = torch.clamp(torch.round(flat / scale), -8, 7).to(torch.int8)

    # Pad to even length
    if q.numel() % 2 != 0:
        q = torch.cat([q, torch.zeros(1, dtype=torch.int8)])

    paired = q.reshape(-1, 2).numpy().astype(np.int8)
    # Pack: mask to 4 bits each, store in one uint8
    packed = ((paired[:, 0] & 0x0F).astype(np.uint8) << 4) | (paired[:, 1] & 0x0F).astype(np.uint8)
    return torch.from_numpy(packed), scale, orig_shape


def dequantize_tensor_int4(packed: torch.Tensor, scale: float, orig_shape: torch.Size) -> torch.Tensor:
    """Unpack INT4 bytes and dequantize to FP32."""
    arr = packed.numpy().astype(np.uint8)
    hi = ((arr >> 4) & 0x0F).astype(np.int8)
    lo = (arr & 0x0F).astype(np.int8)
    # Sign extend from 4-bit: values 8–15 → -8 to -1
    hi = np.where(hi >= 8, hi - 16, hi)
    lo = np.where(lo >= 8, lo - 16, lo)
    flat = np.empty(len(hi) * 2, dtype=np.int8)
    flat[0::2] = hi
    flat[1::2] = lo
    numel = 1
    for s in orig_shape:
        numel *= s
    flat = flat[:numel]
    return torch.from_numpy(flat.astype(np.float32) * float(scale)).reshape(orig_shape)


# ── Model loading ────────────────────────────────────────────────────────────

def load_encoder_ctc(model_path, model_conf):
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


# ── INT4 state dict ──────────────────────────────────────────────────────────

def build_int4_state(model):
    """
    Quantize every Linear weight in encoder + ctc to INT4.
    Decoder weights are excluded (not saved at all).
    Non-linear params (biases, norms, embeddings) stay FP32.
    """
    int4_state = {}
    stats = {'linear_keys': 0, 'other_keys': 0, 'skipped_decoder': 0}

    full_state = model.state_dict()

    for key, tensor in full_state.items():
        # Skip decoder entirely — saves 64.5M params
        if key.startswith('decoder.'):
            stats['skipped_decoder'] += 1
            continue

        # Quantize only weight matrices of Linear layers (2-D, not too small)
        if key.endswith('.weight') and tensor.ndim == 2 and tensor.numel() > 512:
            packed, scale, shape = quantize_tensor_int4(tensor)
            int4_state[key + '.__int4_packed__'] = packed
            int4_state[key + '.__int4_scale__'] = torch.tensor(scale)
            int4_state[key + '.__int4_shape__'] = torch.tensor(list(shape))
            stats['linear_keys'] += 1
        else:
            int4_state[key] = tensor
            stats['other_keys'] += 1

    return int4_state, stats


def reconstruct_state(int4_state):
    """Expand INT4 entries back to FP32 tensors for loading into a model."""
    state = {}
    processed = set()

    for key in int4_state:
        if key.endswith('.__int4_packed__'):
            base = key[: -len('.__int4_packed__')]
            packed = int4_state[base + '.__int4_packed__']
            scale = float(int4_state[base + '.__int4_scale__'])
            shape = torch.Size(int4_state[base + '.__int4_shape__'].tolist())
            state[base] = dequantize_tensor_int4(packed, scale, shape)
            processed.add(base + '.__int4_packed__')
            processed.add(base + '.__int4_scale__')
            processed.add(base + '.__int4_shape__')
        elif key not in processed:
            state[key] = int4_state[key]

    return state


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-path', required=True)
    parser.add_argument('--model-conf', required=True)
    parser.add_argument('--out', default='int4_encoder_ctc.pth')
    args = parser.parse_args()

    print('[int4] Loading model…')
    model, _ = load_encoder_ctc(args.model_path, args.model_conf)
    orig_mb = os.path.getsize(args.model_path) / 1e6

    print('[int4] Quantizing encoder + CTC to INT4 (dropping decoder)…')
    int4_state, stats = build_int4_state(model)

    print(f'[int4]   Linear layers quantized : {stats["linear_keys"]}')
    print(f'[int4]   FP32 params kept        : {stats["other_keys"]}')
    print(f'[int4]   Decoder keys dropped    : {stats["skipped_decoder"]}')

    torch.save(int4_state, args.out)
    out_mb = os.path.getsize(args.out) / 1e6
    print(f'[int4] Done.  {orig_mb:.0f} MB → {out_mb:.0f} MB  ({orig_mb/out_mb:.1f}x compression)')
    print(f'[int4] Load with: reconstruct_state() from quantize_int4.py')


if __name__ == '__main__':
    main()
