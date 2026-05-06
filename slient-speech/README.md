# slient-speech

Real-time visual speech recognition — lip-reads your webcam and types what you silently mouth. Fully local, no cloud, no microphone required.

---

## Requirements

| Requirement | Version |
|---|---|
| Python | 3.11 |
| [uv](https://github.com/astral-sh/uv) | latest |
| [Ollama](https://ollama.com) | latest |
| CUDA | 12.1 (CPU fallback supported) |

Optional: `sounddevice` for audio-visual fusion mode (whisper-level speech).

---

## Setup

```powershell
# 1. Download VSR model weights from HuggingFace (~1.2 GB)
./setup.sh

# 2. Pull the LLM correction model
ollama pull qwen3:4b
```

---

## Run

**Standard (accurate, beam size 40):**

```powershell
uv run --extra-index-url https://download.pytorch.org/whl/cu121 --with-requirements requirements.txt --python 3.11 main.py config_filename=./configs/LRS3_V_WER19.1.ini
```

**Fast (real-time, beam size 8):**

```powershell
uv run --extra-index-url https://download.pytorch.org/whl/cu121 --with-requirements requirements.txt --python 3.11 main.py config_filename=./configs/LRS3_V_WER19.1_fast.ini
```

**LRS2 model (comparison):**

```powershell
uv run --extra-index-url https://download.pytorch.org/whl/cu121 --with-requirements requirements.txt --python 3.11 main.py config_filename=./configs/LRS2_V_WER26.1.ini
```

---

## Controls

| Action | Key |
|---|---|
| Start / stop recording | `Alt` (Windows / Linux) · `Option` (Mac) |
| Quit | `q` with camera window focused |

---

## Model configs

| File | WER | Beam | Language model | Notes |
|---|---|---|---|---|
| `LRS3_V_WER19.1.ini` | 19.1% | 40 | `lm_en_subword` | Best accuracy |
| `LRS3_V_WER19.1_fast.ini` | ~21% | 8 | `lm_en_subword` | Real-time use |
| `LRS2_V_WER26.1.ini` | 26.1% | 40 | None (char-level) | LRS2 model |
| `LRS3_V_WER20.3_conformer.ini` | 20.3% | 40 | None | Needs `./setup_autoavsr.sh` |

---

## Pipeline

```
Alt pressed
    │
    ▼
Pre-roll (0.5 s of buffered frames prepended)
    │
    ▼
16 fps grayscale frames written to temp .mp4
    │
    ▼
MediaPipe face detection → landmark alignment → 96×96 mouth crop
    │
    ▼
LRS3 transformer encoder
    │
    ▼
Beam search (CTC + attention decoder + RNN LM)
Returns top-5 hypotheses with scores
    │
    ▼
qwen3:4b (Ollama) — picks most plausible candidate, fixes errors, adds punctuation
    │
    ▼
Text typed at cursor via pynput
```

### Key design decisions

**Pre-roll buffer** — 0.5 s of frames are buffered continuously while idle. When Alt is pressed, those frames are written to the video first so the first syllable is never lost.

**All 5 beam candidates sent to LLM** — the top-ranked hypothesis is often wrong. Sending all candidates lets the LLM pick the most contextually plausible one.

**`think: false` on qwen3** — disables the model's reasoning chain, cutting LLM latency by 2–4 seconds without hurting correction quality on this task.

**Minimum clip length: 1 second** — prevents accidental Alt taps from triggering inference.

---

## Debug log

Each session appends to `debug_log.txt` in this directory. Every utterance block shows:

```
================================================================================
  UTTERANCE #1 — 2026-05-06 14:23:11
================================================================================

[LRS3 VSR — BEAM SEARCH + LANGUAGE MODEL]
  lm_weight: 0.5   ctc_weight: 0.3   penalty: 0.5   beam_size: 40

    Rank 1  (score:   -12.34)  I AM FINE
    Rank 2  (score:   -13.45)  I'M FINE
    Rank 3  (score:   -14.12)  I AM VINE
    Rank 4  (score:   -15.01)  I'M FIND
    Rank 5  (score:   -15.88)  I AM LINE

[LLM CORRECTION — qwen3:4b]
  Input  : I AM FINE
  Changes: No changes needed.
  Output : I am fine.
```

---

## Known limitations

- **Visually ambiguous phonemes** — b/p/m, f/v, th/s/z, and w/r share identical lip shapes. The LLM corrects these where context allows, but some errors remain.
- **Out-of-vocabulary words** — the LRS3 model was trained on TED talks. Uncommon words, proper nouns, and commands get substituted with visually similar common words.
- **Lighting** — consistent front-facing light on the face significantly improves accuracy. Backlit or dim environments degrade detection.
- **Facial hair** — heavy beards partially occlude lip movement and reduce WER.

---

## Author

**Sanskaar**
