import os

# Absolute path to slient-speech so the backend can import its modules
# and resolve model file paths regardless of where uvicorn is launched from.
SLIENT_SPEECH_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "slient-speech")
)

# ── Model config ──────────────────────────────────────────────────────────────
CONFIG_FILENAME  = os.path.join(SLIENT_SPEECH_DIR, "configs", "LRS3_V_WER19.1.ini")
DETECTOR         = os.environ.get("DETECTOR", "mediapipe")   # or "retinaface"
GPU_IDX          = int(os.environ.get("GPU_IDX", "0"))
MODEL_NAME       = "LRS3_V_WER19.1"

# ── Recording config ──────────────────────────────────────────────────────────
TARGET_FPS       = 25          # must match model training fps
FRAME_WIDTH      = 640
FRAME_HEIGHT     = 480
MIN_FRAMES       = TARGET_FPS  # 1 second minimum

# ── LLM config ────────────────────────────────────────────────────────────────
LLM_MODEL        = "qwen3:4b"
LLM_HISTORY_MAX  = 8           # conversation turns to keep

# ── Server config ─────────────────────────────────────────────────────────────
HOST             = os.environ.get("HOST", "0.0.0.0")
PORT             = int(os.environ.get("PORT", "8000"))
