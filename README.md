# SilentSpeak

> Real-time visual speech recognition — lip-read from your webcam and type what you silently mouth. Fully local, no internet required.

Built for **HACKHIVE 2k26**.

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

## Author

**Sanskaar** — HACKHIVE 2k26
