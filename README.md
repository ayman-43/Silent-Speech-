# SilentSpeak

> Real-time visual speech recognition — lip-read from your webcam and type what you silently mouth. Fully local, no internet required.



---

## Overview

SilentSpeak combines a state-of-the-art Visual Speech Recognition (VSR) model with an LLM correction layer to let you communicate silently using only your lips. A cinematic landing page showcases the product experience.

```
silent-speech/
├── frontend/          # Next.js landing page (Three.js + GSAP)
└── slient-speech/     # Python VSR engine (PyTorch + ESPnet + Mediapipe)
```

---

## Frontend

A cinematic, dark-glass landing page built with **Next.js 16**, **Three.js**, and **GSAP**.

### Stack

| Technology | Version |
|---|---|
| Next.js | 16.2.4 |
| React | 19.2.4 |
| TypeScript | 5 |
| Tailwind CSS | 4 |
| Three.js | 0.184.0 |
| GSAP | 3.15.0 |

### Run locally

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Deploy

The frontend is configured for one-click deployment on **Vercel**. Set the root directory to `frontend/` in your Vercel project settings.

---

## VSR Engine

Real-time lip-reading pipeline running entirely on your machine.

### Requirements

- Python 3.11
- [uv](https://github.com/astral-sh/uv)
- [Ollama](https://ollama.com) with `qwen3:4b` pulled
- NVIDIA GPU with CUDA 12.1 (CPU fallback supported)

### Setup

```bash
cd slient-speech

# Download model weights
./setup.sh

# Pull LLM correction model
ollama pull qwen3:4b
```

### Run

```bash
uv run \
  --extra-index-url https://download.pytorch.org/whl/cu121 \
  --with-requirements requirements.txt \
  --python 3.11 \
  main.py config_filename=./configs/LRS3_V_WER19.1.ini detector=mediapipe
```

### Controls

| Action | Key |
|---|---|
| Start / stop recording | `Alt` (Windows/Linux) · `Option` (Mac) |
| Quit | `q` (with camera window focused) |

---

## Improvements

Four targeted upgrades derived from integrating [auto-AVSR](https://github.com/mpc001/auto_avsr) (Meta's state-of-the-art AVSR framework) with the existing pipeline.

### 1. Beam search tuning for real-time latency

**Status:** Implemented

The default beam size is 40, which gives best accuracy but adds ~300–500 ms per utterance. For real-time use, beam size 8 achieves a good speed/quality balance — the LLM correction layer compensates for the small accuracy drop.

A `fast` preset is available:

```bash
uv run ... main.py config_filename=./configs/LRS3_V_WER19.1_fast.ini detector=mediapipe
```

Or override on the fly:

```bash
uv run ... main.py config_filename=./configs/LRS3_V_WER19.1.ini detector=mediapipe beam_size=8
```

---

### 2. Auto-AVSR conformer checkpoint (250M, trained on 3291h)

**Status:** Config ready — model download required

Auto-AVSR's conformer model (`vsr_trlrs2lrs3vox2avsp_base.pth`) was trained on 3,291 hours of LRS2 + LRS3 + VoxCeleb2 + AVSpeech, giving 20.3% WER. The slient-speech pipeline supports loading it directly.

Download and register the model:

```bash
cd slient-speech
./setup_autoavsr.sh
```

Then run with the conformer config:

```bash
uv run ... main.py config_filename=./configs/LRS3_V_WER20.3_conformer.ini detector=mediapipe
```

---

### 3. Audio-visual (AV) fusion

**Status:** Implemented

When the user is whispering rather than fully silent, fusing a microphone channel alongside lip video dramatically reduces WER. The pipeline now captures microphone audio during every recording and muxes it into the temp video file.

Enable AV mode by using an audiovisual model config:

```bash
uv run ... main.py config_filename=./configs/LRS3_AV.ini detector=mediapipe
```

The `audiovisual` modality is already supported by the `AVSR` and `AVSRDataLoader` classes — no architecture changes needed.

---

### 4. Mouth-cropping pipeline (auto-AVSR preprocessing)

**Status:** Implemented via MediaPipe detector

The existing MediaPipe pipeline already mirrors auto-AVSR's preprocessing: face detection → landmark alignment → 88×88 grayscale mouth ROI crop. Short-range detection (for typical webcam distances of 50–80 cm) is tried first with fallback to full-range, saving ~20 ms per frame.

---

