

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


def _load_auto_avsr_conformer(model_path, modality):
    """Load auto_avsr conformer E2E.  Adds auto_avsr to sys.path temporarily."""
    auto_avsr_root = os.path.normpath(
        os.path.join(os.path.dirname(__file__), '..', '..', '..', 'auto_avsr')
    )
    inserted = False
    if os.path.isdir(auto_avsr_root) and auto_avsr_root not in sys.path:
        sys.path.insert(0, auto_avsr_root)
        inserted = True
    try:
        # Import conformer E2E from auto_avsr's espnet copy
        from espnet.nets.pytorch_backend.e2e_asr_conformer import E2E as ConformerE2E  # noqa
        return ConformerE2E, auto_avsr_root
    except ImportError as exc:
        raise ImportError(
            f"Cannot import auto_avsr conformer from {auto_avsr_root}. "
            f"Make sure auto_avsr submodule is present. Original error: {exc}"
        ) from exc
    finally:
        if inserted and auto_avsr_root in sys.path:
            # Leave it in — needed for encoder/frontend sub-imports during model.to()
            pass


class AVSR(torch.nn.Module):
    def __init__(self, modality, model_path, model_conf, rnnlm=None, rnnlm_conf=None,
        penalty=0., ctc_weight=0.1, lm_weight=0., beam_size=40, device="cuda:0"):
        super(AVSR, self).__init__()
        self.device = device

        with open(model_conf, "rb") as f:
            confs = json.load(f)
        args = confs if isinstance(confs, dict) else confs[2]
        self.train_args = argparse.Namespace(**args)

        # ── Architecture detection ───────────────────────────────────────────
        # Transformer (original ESPnet) models have 'atype'/'elayers'/'adim'.
        # auto_avsr Conformer models lack these keys, and their path contains "conformer".
        is_conformer = (
            'conformer' in model_path.lower()
            or not any(hasattr(self.train_args, k) for k in ('atype', 'elayers', 'adim'))
        )

        # ── Tokenizer ────────────────────────────────────────────────────────
        labels_type = getattr(self.train_args, "labels_type", "char")
        if labels_type == "char":
            self.token_list = self.train_args.char_list
        elif labels_type == "unigram5000":
            file_path = os.path.join(os.path.dirname(__file__), "tokens", "unigram5000_units.txt")
            self.token_list = (
                ['<blank>']
                + [w.split()[0] for w in open(file_path, encoding='utf-8').read().splitlines()]
                + ['<eos>']
            )
        else:
            # auto_avsr conformer: odim encoded directly in train_args
            odim_val = getattr(self.train_args, 'odim', None)
            if odim_val is not None:
                # Use unigram5000 token list (auto_avsr uses SentencePiece unigram5000)
                file_path = os.path.join(os.path.dirname(__file__), "tokens", "unigram5000_units.txt")
                self.token_list = (
                    ['<blank>']
                    + [w.split()[0] for w in open(file_path, encoding='utf-8').read().splitlines()]
                    + ['<eos>']
                )
            else:
                self.token_list = getattr(self.train_args, 'char_list', [])

        self.odim = len(self.token_list)

        # ── Model loading ────────────────────────────────────────────────────
        if is_conformer:
            self.architecture = 'conformer'
            ConformerE2E, _root = _load_auto_avsr_conformer(model_path, modality)
            modality_val = getattr(self.train_args, 'modality', modality)
            self.model = ConformerE2E(self.odim, modality_val)
            state = torch.load(model_path, map_location='cpu')
            # auto_avsr checkpoints may be wrapped in a Lightning checkpoint
            if 'state_dict' in state:
                state = {k.replace('model.', '', 1): v for k, v in state['state_dict'].items() if k.startswith('model.')}
            self.model.load_state_dict(state, strict=False)
        else:
            self.architecture = 'transformer'
            if modality == "audiovisual":
                from espnet.nets.pytorch_backend.e2e_asr_transformer_av import E2E
            else:
                from espnet.nets.pytorch_backend.e2e_asr_transformer import E2E
            self.model = E2E(self.odim, self.train_args)
            self.model.load_state_dict(
                torch.load(model_path, map_location=lambda storage, loc: storage)
            )

        self.model.to(device=self.device).eval()

        self.beam_search = get_beam_search_decoder(
            self.model, self.token_list, rnnlm, rnnlm_conf,
            penalty, ctc_weight, lm_weight, beam_size
        )
        self.beam_search.to(device=self.device).eval()

    def _conformer_encode(self, data):
        """Run auto_avsr conformer frontend + encoder for a single clip."""
        if isinstance(data, tuple):
            video, audio = data
            video = video.unsqueeze(0).to(self.device)   # (1, C, T, H, W)
        else:
            video = data.unsqueeze(0).to(self.device)    # (1, C, T, H, W)

        with torch.no_grad():
            x = self.model.frontend(video)               # (1, T, 512)
            x = self.model.proj_encoder(x)               # (1, T, 768)
            T = x.shape[1]
            # all-True mask: no padding in single-clip inference
            mask = torch.ones(1, 1, T, dtype=torch.bool, device=self.device)
            x, _ = self.model.encoder(x, mask)           # (1, T', 768)
            return x.squeeze(0)                          # (T', 768)

    def infer(self, data, nbest_count=5):
        with torch.no_grad():
            if self.architecture == 'conformer':
                enc_feats = self._conformer_encode(data)
            elif isinstance(data, tuple):
                enc_feats = self.model.encode(data[0].to(self.device), data[1].to(self.device))
            else:
                enc_feats = self.model.encode(data.to(self.device))

            raw_hyps = self.beam_search(enc_feats)
            n = min(len(raw_hyps), nbest_count)
            nbest = []
            for hyp in raw_hyps[:n]:
                text = add_results_to_json([hyp.asdict()], self.token_list)
                text = text.replace("▁", " ").strip().replace("<eos>", "")
                nbest.append((text, float(hyp.score)))
        top = nbest[0][0] if nbest else ""
        return top, nbest


def get_beam_search_decoder(model, token_list, rnnlm=None, rnnlm_conf=None,
                             penalty=0, ctc_weight=0.1, lm_weight=0., beam_size=40):
    sos = model.odim - 1
    eos = model.odim - 1
    scorers = model.scorers()

    lm = None
    if rnnlm:
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
