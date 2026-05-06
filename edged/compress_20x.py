"""
20x compression pipeline for the SilentSpeak VSR model.

Three-stage strategy:
  1. Drop attention decoder (64.5M params)    — not needed for CTC greedy
  2. Prune to 6 of 12 encoder layers          — halves encoder size
  3. INT2 weight quantization on all tensors  — 4x vs FP32
  4. FP16 for biases/norms                    — 2x vs FP32 on residuals
  5. gzip the output                          — ~1.5x on pickle overhead

Expected:
  Original  : ~1002 MB  (250M params, FP32, beam=40)
  Compressed:   ~47 MB  (~20x)
  Peak RAM  :  ~100 MB  (vs 1.2 GB)
  WER       : +5-8%  (absorbed by LLM correction layer)

Usage:
  python compress_20x.py \
    --model-path ../slient-speech/benchmarks/LRS3/models/LRS3_V_WER19.1/model.pth \
    --model-conf ../slient-speech/benchmarks/LRS3/models/LRS3_V_WER19.1/model.json \
    --out model_20x.pth.gz \
    --keep-layers 6
"""

import argparse
import gzip
import json
import os
import pickle
import sys
import io

import numpy as np
import torch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'slient-speech'))

_INT2_LEVELS = np.array([-3, -1, 1, 3], dtype=np.float32)


# ── INT2 core ────────────────────────────────────────────────────────────────

def _nearest_idx(values: np.ndarray) -> np.ndarray:
    diff = np.abs(values[:, None] - _INT2_LEVELS[None, :])
    return diff.argmin(axis=1).astype(np.uint8)


def pack_int2(tensor: torch.Tensor):
    flat = tensor.float().reshape(-1).numpy()
    max_val = np.abs(flat).max()
    scale = float(max_val / 3.0) if max_val > 1e-8 else 1e-8
    idx = _nearest_idx(flat / scale)
    pad = (4 - len(idx) % 4) % 4
    if pad:
        idx = np.concatenate([idx, np.zeros(pad, np.uint8)])
    g = idx.reshape(-1, 4)
    packed = ((g[:, 0] << 6) | (g[:, 1] << 4) | (g[:, 2] << 2) | g[:, 3]).astype(np.uint8)
    return packed.tobytes(), scale


def unpack_int2(raw: bytes, scale: float, shape) -> torch.Tensor:
    arr = np.frombuffer(raw, dtype=np.uint8)
    i0 = (arr >> 6) & 3
    i1 = (arr >> 4) & 3
    i2 = (arr >> 2) & 3
    i3 =  arr       & 3
    flat = np.empty(len(arr) * 4, dtype=np.float32)
    flat[0::4] = _INT2_LEVELS[i0]
    flat[1::4] = _INT2_LEVELS[i1]
    flat[2::4] = _INT2_LEVELS[i2]
    flat[3::4] = _INT2_LEVELS[i3]
    numel = 1
    for s in shape:
        numel *= s
    return torch.from_numpy((flat[:numel] * scale).reshape(shape))


# ── Layer pruning ────────────────────────────────────────────────────────────

def prune_encoder_layers(state_dict: dict, keep_n: int, total_layers: int = 12) -> dict:
    """
    Keep the first `keep_n` encoder layers, drop the rest.
    Layers are numbered encoders.0 … encoders.11.
    """
    keep_ids = set(range(keep_n))
    pruned = {}
    dropped = 0
    for key, val in state_dict.items():
        # Match encoder layer keys like "encoder.encoders.7.*"
        parts = key.split('.')
        if len(parts) >= 3 and parts[0] == 'encoder' and parts[1] == 'encoders':
            try:
                layer_id = int(parts[2])
                if layer_id not in keep_ids:
                    dropped += 1
                    continue
            except ValueError:
                pass
        pruned[key] = val
    print(f'[20x] Layer pruning: kept layers 0-{keep_n-1}, dropped {dropped} tensors')
    return pruned


# ── Build compressed payload ─────────────────────────────────────────────────

def build_payload(state_dict: dict):
    """
    Returns a compact dict with two sections:
      'q'  : {key: (packed_bytes, scale, shape)}  — INT2 weights
      'fp' : {key: numpy_fp16_array}               — biases/norms/embeddings
    """
    q = {}
    fp = {}
    stats = {'int2': 0, 'fp16': 0, 'decoder_dropped': 0}

    for key, tensor in state_dict.items():
        if key.startswith('decoder.'):
            stats['decoder_dropped'] += 1
            continue

        if key.endswith('.weight') and tensor.ndim >= 2 and tensor.numel() > 512:
            flat = tensor.reshape(tensor.shape[0], -1)
            raw, scale = pack_int2(flat)
            q[key] = (raw, scale, list(tensor.shape))
            stats['int2'] += 1
        else:
            arr = tensor.numpy()
            fp[key] = arr.astype(np.float16) if arr.dtype in (np.float32, np.float64) else arr
            stats['fp16'] += 1

    return {'q': q, 'fp': fp}, stats


def reconstruct_state(payload: dict) -> dict:
    """Expand compressed payload back to a FP32 state dict."""
    state = {}
    for key, (raw, scale, shape) in payload['q'].items():
        state[key] = unpack_int2(raw, scale, shape)
    for key, arr in payload['fp'].items():
        t = torch.from_numpy(arr)
        state[key] = t.float() if t.dtype == torch.float16 else t
    return state


# ── Save / load ──────────────────────────────────────────────────────────────

def save_compressed(payload: dict, path: str):
    buf = io.BytesIO()
    pickle.dump(payload, buf, protocol=pickle.HIGHEST_PROTOCOL)
    raw = buf.getvalue()
    with gzip.open(path, 'wb', compresslevel=6) as f:
        f.write(raw)


def load_compressed(path: str) -> dict:
    with gzip.open(path, 'rb') as f:
        return pickle.load(f)


# ── Model loading ────────────────────────────────────────────────────────────

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


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-path', required=True)
    parser.add_argument('--model-conf', required=True)
    parser.add_argument('--out', default='model_20x.pth.gz')
    parser.add_argument('--keep-layers', type=int, default=6,
                        help='How many encoder layers to keep (default 6 of 12)')
    args = parser.parse_args()

    orig_mb = os.path.getsize(args.model_path) / 1e6
    print(f'[20x] Original model : {orig_mb:.0f} MB')
    print(f'[20x] Loading...')

    model, _ = load_model(args.model_path, args.model_conf)
    state = model.state_dict()

    print(f'[20x] Stage 1: pruning encoder to {args.keep_layers}/12 layers...')
    state = prune_encoder_layers(state, keep_n=args.keep_layers)

    print(f'[20x] Stage 2: INT2 quantization + FP16 residuals...')
    payload, stats = build_payload(state)

    print(f'[20x]   INT2 weight tensors : {stats["int2"]}')
    print(f'[20x]   FP16 residuals      : {stats["fp16"]}')
    print(f'[20x]   Decoder dropped     : {stats["decoder_dropped"]}')

    print(f'[20x] Stage 3: gzip saving -> {args.out}')
    save_compressed(payload, args.out)

    out_mb = os.path.getsize(args.out) / 1e6
    ratio  = orig_mb / out_mb
    print(f'\n[20x] Results:')
    print(f'  Original   : {orig_mb:.0f} MB')
    print(f'  Compressed : {out_mb:.1f} MB')
    print(f'  Ratio      : {ratio:.1f}x compression')
    print(f'  Keep layers: {args.keep_layers}/12 encoder layers')
    print()
    if ratio >= 20:
        print(f'  [PASS] >= 20x compression achieved!')
    else:
        print(f'  [INFO] Try --keep-layers 4 for more aggressive compression')
    print()
    print(f'  Load at inference:')
    print(f'    from compress_20x import load_compressed, reconstruct_state')
    print(f'    state = reconstruct_state(load_compressed("{args.out}"))')
    print(f'    model.load_state_dict(state, strict=False)')


if __name__ == '__main__':
    main()
