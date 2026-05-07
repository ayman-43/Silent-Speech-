

import os
import sys
import json
import torch
import argparse
import numpy as np

from espnet.asr.asr_utils import torch_load
from espnet.asr.asr_utils import get_model_conf
from espnet.asr.asr_utils import add_results_to_json
from espnet.nets.batch_beam_search import BatchBeamSearch
from espnet.nets.lm_interface import dynamic_import_lm
from espnet.nets.scorers.length_bonus import LengthBonus
from espnet.nets.pytorch_backend.e2e_asr_transformer import E2E


class AVSR(torch.nn.Module):
    def __init__(self, modality, model_path, model_conf, rnnlm=None, rnnlm_conf=None,
        penalty=0., ctc_weight=0.1, lm_weight=0., beam_size=40, device="cuda:0"):
        super(AVSR, self).__init__()
        self.device = device

        if modality == "audiovisual":
            from espnet.nets.pytorch_backend.e2e_asr_transformer_av import E2E
        else:
            from espnet.nets.pytorch_backend.e2e_asr_transformer import E2E

        assert os.path.isfile(model_conf), (
            f"\n[ERROR] model.json not found at: {model_conf}\n"
            f"  Run: bash setup.sh   (Linux/macOS) or  .\\setup.ps1  (Windows)\n"
        )
        assert os.path.isfile(model_path), (
            f"\n[ERROR] model.pth not found at: {model_path}\n"
            f"  Run: bash setup.sh   (Linux/macOS) or  .\\setup.ps1  (Windows)\n"
        )

        with open(model_conf, "rb") as f:
            confs = json.load(f)
        args = confs if isinstance(confs, dict) else confs[2]
        self.train_args = argparse.Namespace(**args)

        labels_type = getattr(self.train_args, "labels_type", "char")
        if labels_type == "char":
            self.token_list = self.train_args.char_list
        elif labels_type == "unigram5000":
            file_path = os.path.join(os.path.dirname(__file__), "tokens", "unigram5000_units.txt")
            self.token_list = ['<blank>'] + [word.split()[0] for word in open(file_path, encoding='utf-8').read().splitlines()] + ['<eos>']
        self.odim = len(self.token_list)

        device_str = str(device)
        is_cuda = 'cuda' in device_str and torch.cuda.is_available()

        print(f"\n\033[1m[VSR]\033[0m Loading model weights from {os.path.basename(model_path)} ...", flush=True)
        self.model = E2E(self.odim, self.train_args)
        self.model.load_state_dict(torch.load(model_path, map_location='cpu', weights_only=False))
        self.model.to(device=self.device).eval()

        param_count = sum(p.numel() for p in self.model.parameters()) / 1e6
        if is_cuda:
            gpu_idx = torch.device(device_str).index or 0
            gpu_name = torch.cuda.get_device_name(gpu_idx)
            mem_alloc = torch.cuda.memory_allocated(gpu_idx) / 1024**2
            mem_total = torch.cuda.get_device_properties(gpu_idx).total_memory / 1024**2
            print(f"\033[48;5;22m\033[97m\033[1m  GPU LOADED  \033[0m  {gpu_name}")
            print(f"               Params : {param_count:.0f}M")
            print(f"               Memory : {mem_alloc:.0f} MB used / {mem_total:.0f} MB total", flush=True)
        else:
            print(f"\033[48;5;88m\033[97m\033[1m  CPU MODE  \033[0m  {param_count:.0f}M params — inference will be slow", flush=True)

        self.beam_search = get_beam_search_decoder(self.model, self.token_list, rnnlm, rnnlm_conf, penalty, ctc_weight, lm_weight, beam_size)
        self.beam_search.to(device=self.device).eval()
        
    def infer(self, data, nbest_count=10):
        with torch.no_grad():
            if isinstance(data, tuple):
                enc_feats = self.model.encode(data[0].to(self.device), data[1].to(self.device))
            else:
                enc_feats = self.model.encode(data.to(self.device))
            raw_hyps = self.beam_search(enc_feats)
            n = min(len(raw_hyps), nbest_count)
            nbest_raw = []
            for hyp in raw_hyps[:n]:
                text = add_results_to_json([hyp.asdict()], self.token_list)
                text = text.replace("▁", " ").strip().replace("<eos>", "")
                raw_score = float(hyp.score)
                # hyp.yseq starts with SOS; exclude it for length count.
                # Length-normalised score penalises the model's natural bias
                # toward short sequences — e.g. "HELLO THIS IS A VIDEO" (-8.57/5=-1.71)
                # loses correctly to "HELLO THIS IS A DEMO VIDEO" (-9.76/6=-1.63).
                tok_len = max(len(hyp.yseq) - 1, 1)
                norm_score = raw_score / tok_len
                nbest_raw.append((text, raw_score, norm_score))

        # Re-rank by length-normalised score (less negative = better).
        # This is the key fix: raw beam scores systematically favour shorter
        # hypotheses even when a longer one has better per-token probability.
        nbest_raw.sort(key=lambda x: -x[2])

        top   = nbest_raw[0][0] if nbest_raw else ""
        nbest = [(text, raw_score) for text, raw_score, _ in nbest_raw]
        return top, nbest


def get_beam_search_decoder(model, token_list, rnnlm=None, rnnlm_conf=None, penalty=0, ctc_weight=0.1, lm_weight=0., beam_size=40):
    sos = model.odim - 1
    eos = model.odim - 1
    scorers = model.scorers()

    if not rnnlm:
        lm = None
    else:
        lm_args = get_model_conf(rnnlm, rnnlm_conf)
        lm_model_module = getattr(lm_args, "model_module", "default")
        lm_class = dynamic_import_lm(lm_model_module, lm_args.backend)
        lm = lm_class(len(token_list), lm_args)
        torch_load(rnnlm, lm)
        lm.eval()

    scorers["lm"] = lm
    scorers["length_bonus"] = LengthBonus(len(token_list))
    weights = dict(
        decoder=1.0 - ctc_weight,
        ctc=ctc_weight,
        lm=lm_weight,
        length_bonus=penalty,
    )

    return BatchBeamSearch(
        beam_size=beam_size,
        vocab_size=len(token_list),
        weights=weights,
        scorers=scorers,
        sos=sos,
        eos=eos,
        token_list=token_list,
        pre_beam_score_key=None if ctc_weight == 1.0 else "decoder",
    )
