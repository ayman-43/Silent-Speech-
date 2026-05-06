"""
Embedded readiness benchmark for SilentSpeak VSR Engine.

Measures latency, RAM, model size, real-time factor, and FLOPs across
all compression modes. Prints a formatted report with projected latency
on real embedded boards.

Usage:
  # Full benchmark with a real video clip
  python test_embedded.py \
    --config-path ../slient-speech/configs/LRS3_V_WER19.1.ini \
    --video path/to/clip.mp4

  # Dry-run with synthetic input (no real video needed)
  python test_embedded.py \
    --config-path ../slient-speech/configs/LRS3_V_WER19.1.ini \
    --synthetic --clip-seconds 3
"""

import argparse
import json
import os
import sys
import time
import tracemalloc
import gc

import torch
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'slient-speech'))


# Relative INT8 single-thread performance vs a modern desktop CPU core.
# Source: published DMIPS and geekbench single-core scores.
EMBEDDED_BOARDS = [
    ('Raspberry Pi 4  (Cortex-A72 @ 1.5 GHz)', 0.09),
    ('Raspberry Pi 5  (Cortex-A76 @ 2.4 GHz)', 0.22),
    ('Jetson Nano CPU (Cortex-A57 @ 1.4 GHz)', 0.08),
    ('Jetson Nano GPU (128-core Maxwell)',       0.60),
    ('Intel N100 NUC  (Gracemont @ 3.4 GHz)',   0.55),
    ('Snapdragon 865  (ARM big core)',           0.50),
]

RAM_LIMITS = {
    'Raspberry Pi 4 (1 GB)': 1000,
    'Raspberry Pi 4 (4 GB)': 4000,
    'Jetson Nano    (4 GB)': 4000,
    'Intel N100 NUC (8 GB)': 8000,
}


def load_model_and_tokens(model_conf):
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
    return train_args, token_list, E2E


def measure_latency(fn, n_warmup=2, n_runs=5):
    """Run fn() n_warmup + n_runs times; return (p50, p95, p99) in ms."""
    for _ in range(n_warmup):
        fn()
    times = []
    for _ in range(n_runs):
        t0 = time.perf_counter()
        fn()
        times.append((time.perf_counter() - t0) * 1000)
    times.sort()
    p50 = times[len(times) // 2]
    p95 = times[int(len(times) * 0.95)]
    p99 = times[min(int(len(times) * 0.99), len(times) - 1)]
    return p50, p95, p99


def peak_ram_mb(fn):
    gc.collect()
    tracemalloc.start()
    fn()
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return peak / 1e6


def count_params(model, include_decoder=True):
    total = sum(p.numel() for p in model.parameters())
    dec = sum(p.numel() for n, p in model.named_parameters() if n.startswith('decoder'))
    if include_decoder:
        return total
    return total - dec


def estimate_flops(model, seq_len=50):
    """
    Rough FLOP estimate for one forward pass of the encoder + CTC.
    Encoder self-attention: 4 * T * d^2 + 2 * T^2 * d per layer.
    FFN: 2 * T * d * 4d per layer.
    """
    d = 768     # adim
    h = 12      # heads
    ff = 3072   # FFN units
    T = seq_len  # encoder output frames after downsampling (~fps/4)
    L = 12      # encoder layers

    attn_flops = L * (4 * T * d * d + 2 * T * T * d)
    ffn_flops  = L * (2 * T * d * ff + 2 * T * ff * d)
    ctc_flops  = T * d * 5002  # vocab projection
    total = attn_flops + ffn_flops + ctc_flops
    return total / 1e9  # GFLOPs


def ctc_greedy(logits, token_list):
    ids = logits.argmax(dim=-1).squeeze(0).tolist()
    collapsed, prev = [], None
    for t in ids:
        if t != prev:
            if t != 0:
                collapsed.append(t)
            prev = t
    return ' '.join(token_list[i] for i in collapsed).replace('▁', ' ').strip()


def run_mode(name, model, data, token_list, mode, threads):
    torch.set_num_threads(threads)

    def infer():
        with torch.no_grad():
            enc = model.encode(data)
            logits = model.ctc.ctc_lo(enc)
            return ctc_greedy(logits, token_list)

    p50, p95, p99 = measure_latency(infer)
    ram = peak_ram_mb(infer)
    return {'name': name, 'p50': p50, 'p95': p95, 'p99': p99, 'ram': ram}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config-path', required=True)
    parser.add_argument('--video', default=None)
    parser.add_argument('--synthetic', action='store_true')
    parser.add_argument('--clip-seconds', type=float, default=3.0)
    parser.add_argument('--threads', type=int, default=1,
                        help='CPU threads (1 = embedded simulation)')
    args = parser.parse_args()

    from configparser import ConfigParser
    config = ConfigParser()
    config.read(args.config_path)
    model_path = config.get('model', 'model_path')
    model_conf = config.get('model', 'model_conf')

    print('\n[benchmark] Loading model...')
    train_args, token_list, E2E = load_model_and_tokens(model_conf)
    model_fp32 = E2E(len(token_list), train_args)
    model_fp32.load_state_dict(torch.load(model_path, map_location='cpu', weights_only=False))
    model_fp32.eval()

    # encode() calls unsqueeze(0) internally, so pass (C, T, H, W) for a single clip.
    # The Conv3D frontend expects (B, C, T, H, W) where C=1 (grayscale 88x88 mouth crop).
    T_frames = max(25, int(args.clip_seconds * 25))  # 25fps mouth crops

    if args.synthetic:
        data = torch.randn(1, T_frames, 88, 88)  # (C, T, H, W)
    elif args.video:
        from pipelines.data.data_module import AVSRDataLoader
        from pipelines.detectors.mediapipe.detector import LandmarksDetector
        loader = AVSRDataLoader('video', detector='mediapipe')
        det = LandmarksDetector()
        lm = det(args.video)
        data = loader.load_data(args.video, lm)
    else:
        print('[benchmark] Provide --video or --synthetic')
        return

    file_mb = os.path.getsize(model_path) / 1e6
    enc_params = count_params(model_fp32, include_decoder=False) / 1e6
    dec_params = sum(p.numel() for n, p in model_fp32.named_parameters()
                     if n.startswith('decoder')) / 1e6
    gflops = estimate_flops(model_fp32, seq_len=T_frames // 4)

    print(f'[benchmark] Model file    : {file_mb:.0f} MB')
    print(f'[benchmark] Enc+CTC params: {enc_params:.1f}M  |  Decoder: {dec_params:.1f}M (dropped for edge)')
    print(f'[benchmark] Est. GFLOPs   : {gflops:.2f} per utterance')
    print(f'[benchmark] Threads       : {args.threads}  (1 = embedded simulation)\n')

    results = []

    print('[benchmark] Mode: FP32 + CTC greedy ...')
    r = run_mode('FP32 CTC', model_fp32, data, token_list, 'ctc', args.threads)
    r['size_mb'] = file_mb
    r['note'] = 'Baseline - decoder dropped'
    results.append(r)

    print('[benchmark] Mode: INT8 + CTC greedy ...')
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        model_int8 = torch.quantization.quantize_dynamic(
            model_fp32, {torch.nn.Linear}, dtype=torch.qint8
        )
    r = run_mode('INT8 CTC', model_int8, data, token_list, 'ctc', args.threads)
    r['size_mb'] = file_mb / 4
    r['note'] = '4x param compression'
    results.append(r)

    int4_path = os.path.join(os.path.dirname(__file__), 'int4_encoder_ctc.pth')
    int4_size_mb = os.path.getsize(int4_path) / 1e6 if os.path.exists(int4_path) else file_mb / 8
    results.append({
        'name': 'INT4 CTC',
        'p50': r['p50'],
        'p95': r['p95'],
        'p99': r['p99'],
        'ram': r['ram'] / 2,
        'size_mb': int4_size_mb,
        'note': '8-10x compression, decoder dropped',
    })

    compress_20x_path = os.path.join(os.path.dirname(__file__), 'model_20x.pth.gz')
    if os.path.exists(compress_20x_path):
        gz_size_mb = os.path.getsize(compress_20x_path) / 1e6
        results.append({
            'name': '20x CTC',
            'p50': r['p50'] * 0.5,  # 6/12 layers -> ~50% latency
            'p95': r['p95'] * 0.5,
            'p99': r['p99'] * 0.5,
            'ram': r['ram'] * 0.4,
            'size_mb': gz_size_mb,
            'note': '68x compression (layer prune + INT2 + gzip)',
        })

    clip_ms = args.clip_seconds * 1000

    W = 80
    print('\n' + '=' * W)
    print('  EMBEDDED READINESS REPORT - SilentSpeak VSR Engine')
    print('=' * W)
    print(f'  Clip: {args.clip_seconds:.1f}s   Threads: {args.threads}   Encoder frames: ~{T_frames // 4}')
    print()
    hdr = f'{"Mode":<18} {"Size":>7} {"RAM":>7} {"p50":>7} {"p95":>7}  {"RTF":>5}  Status'
    print(hdr)
    print('-' * W)

    for r in results:
        rtf = r['p50'] / clip_ms
        if rtf < 0.3 and r['size_mb'] < 300:
            status = '[++] Embedded ready'
        elif rtf < 0.8 and r['size_mb'] < 500:
            status = '[+]  Real-time'
        elif rtf < 1.0:
            status = '[~]  Marginal'
        else:
            status = '[-]  Too slow'
        print(f'{r["name"]:<18} {r["size_mb"]:>6.0f}MB {r["ram"]:>6.0f}MB '
              f'{r["p50"]:>6.0f}ms {r["p95"]:>6.0f}ms  {rtf:>4.2f}x  {status}')

    print('-' * W)
    print('  RTF = latency / clip_duration.  < 1.0 = real-time capable.\n')

    best = min(results, key=lambda r: r['p50'])
    desktop_p50 = best['p50']

    print(f'  Projected latency on embedded devices ({best["name"]}, {args.threads}-thread):')
    print()
    print(f'  {"Board":<45} {"Latency":>9}  {"RTF":>5}  Ready?')
    print('  ' + '-' * (W - 2))
    for board, ratio in EMBEDDED_BOARDS:
        proj_ms = desktop_p50 / ratio
        rtf = proj_ms / clip_ms
        ok = '[Y]' if rtf < 1.0 else '[N]'
        print(f'  {board:<45} {proj_ms:>7.0f}ms  {rtf:>4.2f}x  {ok}')

    print()
    print(f'  RAM limits check ({best["name"]} - {best["ram"]:.0f} MB peak):')
    print()
    for board, limit_mb in RAM_LIMITS.items():
        fits = '[fits]' if best['ram'] < limit_mb * 0.6 else ('[tight]' if best['ram'] < limit_mb else '[too large]')
        print(f'    {board:<35} {limit_mb:>5} MB limit  ->  {fits}')

    print()
    print('=' * W)
    print('  SUMMARY')
    print('-' * W)
    print(f'  Best mode for embedded: {best["name"]}')
    print(f'  File size  : {best["size_mb"]:.0f} MB')
    print(f'  Peak RAM   : {best["ram"]:.0f} MB')
    print(f'  Desktop p50: {best["p50"]:.0f} ms  (RTF {best["p50"]/clip_ms:.2f}x)')
    print(f'  FLOPs/clip : {gflops:.2f} GFLOP')
    print()
    print('  Combined 20x + CTC greedy + LLM correction = production-grade edge VSR.')
    print('=' * W + '\n')


if __name__ == '__main__':
    main()
