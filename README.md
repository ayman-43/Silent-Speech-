# SilentSpeak

> Real-time visual speech recognition — lip-read from your webcam and type what you silently mouth. Fully local, no internet required.

Built for **HACKHIVE 2k26** by **Sanskaar**.

---

## What it does

SilentSpeak watches your webcam, reads your lip movements, and types the transcription at your cursor — no microphone, no internet, no cloud. Everything runs on your machine.

The pipeline has three stages:

```
Webcam frames
      │
      ▼
 Face detection (MediaPipe)
      │
      ▼
 VSR model (LRS3 transformer, 19.1% WER)
 + RNN language model beam search
      │
      ▼
 LLM correction (qwen3:4b via Ollama)
      │
      ▼
 Text typed at cursor
```

---

## Repository layout

```
├── frontend/               Next.js 16 landing page
└── slient-speech/          Python VSR engine
    ├── main.py
    ├── silent_speech.py    Core app — webcam loop, LLM correction, audio capture
    ├── configs/            Model + decode configs
    ├── pipelines/          VSR pipeline, face detectors, data loaders
    ├── espnet/             ESPnet ASR utilities (beam search, scoring)
    ├── hydra_configs/      Hydra config defaults
    ├── requirements.txt
    └── setup.sh            Downloads model weights from HuggingFace
```

---

## Frontend

Cinematic dark-glass landing page built with Next.js 16, Three.js, and GSAP.

### Run

```powershell
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Deploy (Vercel)

`vercel.json` at the repo root points Vercel at `frontend/` — one-click deploy, no extra config needed.

---

## VSR Engine

### Requirements

| Requirement | Version |
|---|---|
| Python | 3.11 |
| [uv](https://github.com/astral-sh/uv) | latest |
| [Ollama](https://ollama.com) | latest |
| CUDA | 12.1 (CPU fallback supported) |

`sounddevice` is optional — only needed for audio-visual fusion mode.

### Setup

```powershell
cd slient-speech

# 1. Download VSR model weights (~1.2 GB)
./setup.sh

# 2. Pull the LLM correction model
ollama pull qwen3:4b
```

### Run

```powershell
uv run --extra-index-url https://download.pytorch.org/whl/cu121 --with-requirements requirements.txt --python 3.11 main.py config_filename=./configs/LRS3_V_WER19.1.ini
```

For lower latency (beam size 8 instead of 40):

```powershell
uv run --extra-index-url https://download.pytorch.org/whl/cu121 --with-requirements requirements.txt --python 3.11 main.py config_filename=./configs/LRS3_V_WER19.1_fast.ini
```

### Controls

| Action | Key |
|---|---|
| Start / stop recording | `Alt` (Windows / Linux) · `Option` (Mac) |
| Quit | `q` with the camera window focused |

---

## Available model configs

| Config file | Model | WER | Beam | Notes |
|---|---|---|---|---|
| `LRS3_V_WER19.1.ini` | LRS3 transformer | 19.1% | 40 | Best accuracy, ~300–500 ms/utterance |
| `LRS3_V_WER19.1_fast.ini` | LRS3 transformer | ~21% | 8 | Real-time, recommended for live use |
| `LRS2_V_WER26.1.ini` | LRS2 transformer | 26.1% | 40 | Char-level, no LM — comparison only |
| `LRS3_V_WER20.3_conformer.ini` | auto-AVSR conformer | 20.3% | 40 | Requires `./setup_autoavsr.sh` |

Switch configs with `config_filename=./configs/<name>.ini`.

---

## How the pipeline works

### 1. Recording

- Camera runs at 16 fps, 640×480
- A **0.5-second pre-roll buffer** captures frames continuously — when you press Alt, those frames are prepended to the recording so the first syllable is never clipped
- Minimum clip length: 1 second (prevents accidental taps from triggering inference)
- Recordings are saved to a temp directory and deleted after inference

### 2. Face detection & preprocessing

- **MediaPipe** detects the face and extracts 4 landmark points
- Short-range detector (optimised for 50–80 cm webcam distance) is tried first, full-range as fallback — saves ~20 ms per frame
- Face is affine-transformed and aligned to a mean-face reference
- A 96×96 grayscale mouth ROI is cropped from each frame

### 3. VSR model (LRS3 transformer)

- Conformer/Transformer encoder processes the sequence of mouth frames
- **Beam search** decodes the output using:
  - Attention decoder scores
  - CTC scores (`ctc_weight=0.3`)
  - RNN language model scores (`lm_weight=0.5`)
  - Length penalty (`penalty=0.5`)
- Top 5 beam hypotheses are returned and passed to the LLM

### 4. LLM correction (qwen3:4b)

- Receives all 5 beam search candidates, not just the top-1
- Runs with `think: false` to minimise latency
- Maintains a **rolling conversation history** (last 4 exchanges) for context
- Fixes three known error patterns:
  - **Phoneme confusions** — b/p/m, f/v, th/s/z, w/r share identical lip shapes
  - **Out-of-vocabulary words** — rare words get replaced by visually similar common words
  - **Clipped starts** — first syllable often missing; LLM reconstructs from context
- Corrected text is typed at the cursor via `pynput`

### 5. Debug log

Every session writes a `debug_log.txt` next to `silent_speech.py`:

```
================================================================================
  UTTERANCE #1 — 2026-05-06 14:23:11
================================================================================

[LRS3 VSR — BEAM SEARCH + LANGUAGE MODEL]
  lm_weight: 0.5   ctc_weight: 0.3   penalty: 0.5   beam_size: 40

    Rank 1  (score:   -12.34)  I AM FINE
    Rank 2  (score:   -13.45)  I'M FINE
    Rank 3  (score:   -14.12)  I AM VINE

[LLM CORRECTION — qwen3:4b]
  Input  : I AM FINE
  Changes: No changes needed.
  Output : I am fine.
```

---

## Improvements made during development

| # | Improvement | File |
|---|---|---|
| 1 | Removed JPEG quality-25 compression — was degrading input before the model | `silent_speech.py` |
| 2 | Increased resolution (`res_factor` 3 → 1) — more pixels in the lip region | `silent_speech.py` |
| 3 | Pre-roll buffer (0.5 s) — fixes clipped utterance starts | `silent_speech.py` |
| 4 | Minimum clip length 2 s → 1 s — short phrases no longer discarded | `silent_speech.py` |
| 5 | MediaPipe short-range detector tried first (faster for typical webcam distance) | `detector.py` |
| 6 | Raised `lm_weight` 0.3 → 0.5, `ctc_weight` 0.1 → 0.3, added `penalty=0.5` | `LRS3_V_WER19.1.ini` |
| 7 | LLM receives all 5 beam candidates, not just top-1 | `silent_speech.py` |
| 8 | Rolling conversation history for context-aware LLM correction | `silent_speech.py` |
| 9 | Phoneme confusion + OOV hints in LLM system prompt | `silent_speech.py` |
| 10 | `think: false` on qwen3 — cuts LLM latency by 2–4 s | `silent_speech.py` |
| 11 | Fixed futures cleanup loop (was mutating list during iteration) | `silent_speech.py` |
| 12 | Fixed race condition on recording toggle (added `threading.Lock`) | `silent_speech.py` |
| 13 | Fixed `typing_lock` init race (`threading.Event` gates async init) | `silent_speech.py` |
| 14 | Fixed `if/elif` in detector selection — retinaface import no longer triggered | `pipeline.py` |
| 15 | Executor `max_workers` 1 → 3 — concurrent inference for back-to-back clips | `silent_speech.py` |
| 16 | Temp files moved to `tempfile.mkdtemp()` — no leaks on crash | `silent_speech.py` |
| 17 | Debug log with beam hypotheses + LLM corrections per utterance | `silent_speech.py` |
| 18 | Fast config preset (`beam_size=8`) for real-time latency | `LRS3_V_WER19.1_fast.ini` |
| 19 | Audio capture via `sounddevice` with AV mux for audiovisual mode | `silent_speech.py` |
| 20 | `AsyncClient` created inside event loop — fixes httpx loop binding | `silent_speech.py` |

---

## Author

**Sanskaar** — HACKHIVE 2k26
