# silent-speech

A real-time visual speech recognition (VSR) tool that lip-reads from your webcam and types what you silently mouth — fully local, no internet required.

## Requirements

- Python 3.11
- [uv](https://github.com/astral-sh/uv)
- [Ollama](https://ollama.com) with the `qwen3:4b` model pulled
- NVIDIA GPU with CUDA 12.1 (CPU fallback supported)

## Setup

1. Clone the repo and `cd` into the `slient-speech/` directory.

2. Download the VSR model weights:

   **Linux / macOS**
   ```sh
   bash setup.sh
   ```

   **Windows (PowerShell)**
   ```powershell
   .\setup.ps1
   ```

   Both scripts download the LRS3 VSR model (19.1% WER) and the English subword language model into `benchmarks/`.

3. Pull the LLM correction model via Ollama:
   ```sh
   ollama pull qwen3:4b
   ```

## Running

```sh
uv run --extra-index-url https://download.pytorch.org/whl/cu121 --with-requirements requirements.txt --python 3.11 main.py config_filename=./configs/LRS3_V_WER19.1.ini detector=mediapipe
```

On startup you will see GPU confirmation output, e.g.:

```
  CUDA    GPU 0: NVIDIA GeForce RTX 3060  (12288 MB VRAM)
[VSR] Loading pipeline from ./configs/LRS3_V_WER19.1.ini ...
[VSR] Loading model weights from model.pth ...
  GPU LOADED    NVIDIA GeForce RTX 3060
               Params : 243M
               Memory : 927 MB used / 12288 MB total
  READY    Alt = start/stop recording   q = quit
```

### Fast preset (lower latency)

```sh
uv run ... main.py config_filename=./configs/LRS3_V_WER19.1_fast.ini detector=mediapipe
```

Uses beam size 8 instead of 40 — ~4× faster with minor accuracy drop compensated by the LLM layer.

## Usage

| Action | Key |
|---|---|
| Start / stop recording | `Alt` (Windows/Linux) · `Option` (Mac) |
| Quit | `q` with the camera window focused |

Once you stop recording, the raw VSR transcript is printed to the terminal and the LLM-corrected version is typed at your cursor automatically.

## Debug log

Every session writes a structured log to `debug_log.txt` (next to `silent_speech.py`) with:
- Beam search candidates and scores for each utterance
- LLM correction diffs and final output
- Errors and fallbacks
