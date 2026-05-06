"""
Benchmark original vs compressed model on a video clip.

Prints latency and (if --reference given) WER for each mode.

Usage:
  python benchmark.py --video path/to/clip.mp4 \
                      --config-path ../slient-speech/configs/LRS3_V_WER19.1.ini
"""

import argparse
import time
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'slient-speech'))


def run_original(config_path, video):
    from pipelines.pipeline import InferencePipeline
    import torch
    pipeline = InferencePipeline(
        config_path,
        device=torch.device('cuda' if torch.cuda.is_available() else 'cpu'),
        detector='mediapipe',
        face_track=True,
        beam_size_override=40,
    )
    t0 = time.perf_counter()
    transcript, _ = pipeline(video)
    return transcript, time.perf_counter() - t0


def run_edge(config_path, video, mode):
    from pipeline_edge import EdgePipeline
    pipeline = EdgePipeline(config_path=config_path, mode=mode, device_str='cpu')
    t0 = time.perf_counter()
    transcript = pipeline.infer(video)
    return transcript, time.perf_counter() - t0


def wer(ref, hyp):
    ref_w = ref.lower().split()
    hyp_w = hyp.lower().split()
    # Simple Levenshtein edit distance
    dp = list(range(len(ref_w) + 1))
    for h in hyp_w:
        ndp = [dp[0] + 1]
        for j, r in enumerate(ref_w):
            ndp.append(min(dp[j] + (0 if r == h else 1), dp[j+1] + 1, ndp[-1] + 1))
        dp = ndp
    return dp[-1] / max(len(ref_w), 1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--video', required=True)
    parser.add_argument('--config-path', required=True)
    parser.add_argument('--reference', default=None, help='Ground-truth transcript for WER')
    args = parser.parse_args()

    results = []

    print('\n[benchmark] Running original (beam=40) …')
    try:
        text, t = run_original(args.config_path, args.video)
        results.append(('Original  (beam=40)', text, t))
    except Exception as e:
        print(f'  FAILED: {e}')

    for mode in ['ctc', 'int8']:
        print(f'[benchmark] Running edge mode: {mode} …')
        try:
            text, t = run_edge(args.config_path, args.video, mode)
            label = f'Edge {mode.upper():5s} (beam=4 / greedy)'
            results.append((label, text, t))
        except Exception as e:
            print(f'  FAILED: {e}')

    print('\n' + '─' * 70)
    print(f'{"Mode":<35} {"Latency":>10}  {"WER":>6}  Transcript')
    print('─' * 70)
    for label, text, t in results:
        w = f'{wer(args.reference, text)*100:.1f}%' if args.reference else '  N/A'
        print(f'{label:<35} {t*1000:>8.0f}ms  {w:>6}  {text[:40]}')
    print('─' * 70)


if __name__ == '__main__':
    main()
