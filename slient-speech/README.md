# silent-speech

A real-time visual speech recognition (VSR) tool that lip-reads from your webcam and types what you silently mouth — fully local, no internet required.

## Requirements

- Python 3.11
- [uv](https://github.com/astral-sh/uv)
- [Ollama](https://ollama.com) with the `qwen3:4b` model pulled
- NVIDIA GPU with CUDA 12.1 (CPU fallback supported)

## Setup

1. Clone the repo and `cd` into it.

2. Download the model files:
   ```sh
   ./setup.sh
   ```
   This places the required `.pth` and `.json` files under `benchmarks/`.

3. Pull the LLM correction model via Ollama:
   ```sh
   ollama pull qwen3:4b
   ```

## Running

```sh
uv run --extra-index-url https://download.pytorch.org/whl/cu121 --with-requirements requirements.txt --python 3.11 main.py config_filename=./configs/LRS3_V_WER19.1.ini detector=mediapipe
```

## Usage

| Action | Key |
|---|---|
| Start / stop recording | `Alt` (Windows/Linux) or `Option` (Mac) |
| Quit | Press `q` with the camera window focused |

Once you stop recording, the raw VSR transcript is printed to the terminal and the LLM-corrected version is typed at your cursor automatically.
