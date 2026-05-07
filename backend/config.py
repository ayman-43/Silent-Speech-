import os

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT_DIR          = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
SLIENT_SPEECH_DIR = os.path.join(ROOT_DIR, "slient-speech")
CONFIGS_DIR       = os.path.join(SLIENT_SPEECH_DIR, "configs")

# ── Active model (override with env var MODEL_CONFIG) ─────────────────────────
# Path is resolved relative to slient-speech/ so the pipeline finds weights.
_cfg_name    = os.environ.get("MODEL_CONFIG", "LRS3_V_WER19.1_fast.ini")
CONFIG_PATH  = os.path.join(CONFIGS_DIR, _cfg_name)

DETECTOR     = os.environ.get("DETECTOR", "mediapipe")   # mediapipe | retinaface
GPU_IDX      = int(os.environ.get("GPU_IDX", "0"))

# ── Recording ─────────────────────────────────────────────────────────────────
TARGET_FPS   = 25          # must match model v_fps in .ini
MIN_FRAMES   = TARGET_FPS  # 1 second minimum

# ── LLM ───────────────────────────────────────────────────────────────────────
LLM_MODEL        = os.environ.get("LLM_MODEL", "qwen3:4b")
LLM_HISTORY_MAX  = 16   # keep 8 full exchange pairs for multi-turn context
LLM_TIMEOUT      = float(os.environ.get("LLM_TIMEOUT", "8"))  # seconds

# ── Server ────────────────────────────────────────────────────────────────────
HOST  = os.environ.get("HOST", "0.0.0.0")
PORT  = int(os.environ.get("PORT", "8000"))

# Derived: list all available .ini configs
def available_configs() -> list[str]:
    if not os.path.isdir(CONFIGS_DIR):
        return []
    return [f for f in os.listdir(CONFIGS_DIR) if f.endswith(".ini")]
