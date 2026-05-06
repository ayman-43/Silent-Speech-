#!/usr/bin/env bash
# Downloads the auto-AVSR conformer model (vsr_trlrs2lrs3vox2avsp_base.pth)
# trained on 3291h (LRS2 + LRS3 + VoxCeleb2 + AVSpeech) — 20.3% WER on LRS3.
#
# Requires: gdown   pip install gdown
# Model source: https://github.com/mpc001/auto_avsr

set -e

DEST="benchmarks/LRS3/models/LRS3_V_WER20.3_conformer"
mkdir -p "$DEST"

echo "[auto-avsr] Downloading conformer VSR model (250M params)..."
gdown "1r1kx7l9sWnDOCnaFHIGvOtzuhFyFA88_" -O "$DEST/model.pth"

echo "[auto-avsr] Done. Model saved to $DEST/model.pth"
echo ""
echo "Run with:"
echo "  uv run ... main.py config_filename=./configs/LRS3_V_WER20.3_conformer.ini detector=mediapipe"
