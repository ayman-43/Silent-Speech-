"""
Dynamic INT8 quantization of the VSR model.

Converts all Linear layers from FP32 → INT8.
No calibration data needed — works on the saved checkpoint directly.

Expected results:
  Size : 956 MB → ~240 MB  (4x reduction)
  Speed: 1.5–3x faster on CPU (Linear matmuls are INT8)
  WER  : +0.5–1% degradation (negligible)

Usage:
  python quantize.py --model-path ../slient-speech/benchmarks/LRS3/models/LRS3_V_WER19.1/model.pth \
                     --model-conf ../slient-speech/benchmarks/LRS3/models/LRS3_V_WER19.1/model.json \
                     --out quantized_int8.pth
"""

import argparse
import json
import sys
import os
import torch
import torch.quantization

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'slient-speech'))
from espnet.nets.pytorch_backend.e2e_asr_transformer import E2E


def load_model(model_path, model_conf):
    with open(model_conf) as f:
        confs = json.load(f)
    args_dict = confs if isinstance(confs, dict) else confs[2]

    import argparse as _ap
    train_args = _ap.Namespace(**args_dict)
    labels_type = getattr(train_args, 'labels_type', 'char')

    if labels_type == 'char':
        token_list = train_args.char_list
    elif labels_type == 'unigram5000':
        units_path = os.path.join(
            os.path.dirname(__file__), '..', 'slient-speech',
            'pipelines', 'tokens', 'unigram5000_units.txt'
        )
        token_list = ['<blank>'] + [
            w.split()[0] for w in open(units_path, encoding='utf-8').read().splitlines()
        ] + ['<eos>']
    else:
        raise ValueError(f'Unknown labels_type: {labels_type}')

    model = E2E(len(token_list), train_args)
    state = torch.load(model_path, map_location='cpu')
    model.load_state_dict(state)
    model.eval()
    return model


def quantize(model):
    return torch.quantization.quantize_dynamic(
        model,
        qconfig_spec={torch.nn.Linear},
        dtype=torch.qint8,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-path', required=True)
    parser.add_argument('--model-conf', required=True)
    parser.add_argument('--out', default='quantized_int8.pth')
    args = parser.parse_args()

    print('[edged] Loading model…')
    model = load_model(args.model_path, args.model_conf)

    orig_mb = sum(p.numel() * p.element_size() for p in model.parameters()) / 1e6
    print(f'[edged] Original parameter memory: {orig_mb:.0f} MB')

    print('[edged] Applying dynamic INT8 quantization…')
    qmodel = quantize(model)

    print(f'[edged] Saving → {args.out}')
    torch.save(qmodel.state_dict(), args.out)

    out_mb = os.path.getsize(args.out) / 1e6
    print(f'[edged] Done.  File size: {out_mb:.0f} MB  (was {orig_mb:.0f} MB param mem)')


if __name__ == '__main__':
    main()
