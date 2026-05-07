"""
VSR inference engine — wraps slient-speech InferencePipeline.

Key design decisions
--------------------
* sys.path is patched once at import time so all slient-speech submodules
  (pipelines/, espnet/, …) resolve correctly.
* Model .ini paths are resolved to absolute before being handed to
  InferencePipeline, so no os.chdir() gymnastics are needed at inference time.
* CLAHE is applied per-frame before writing the temp video so the model
  always sees high-contrast lip imagery regardless of ambient lighting.
* Temp files are always deleted in a finally block.
"""

import configparser
import logging
import os
import sys
import tempfile

import cv2
import numpy as np
import torch

try:
    from . import config as cfg
except ImportError:
    import config as cfg  # type: ignore

logger = logging.getLogger(__name__)

# ── Make slient-speech importable ─────────────────────────────────────────────
if cfg.SLIENT_SPEECH_DIR not in sys.path:
    sys.path.insert(0, cfg.SLIENT_SPEECH_DIR)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_absolute_config(src_ini: str) -> str:
    """
    Read *src_ini*, make every model/rnnlm path absolute, write to a temp file.
    The caller owns the temp file and must delete it.
    """
    parser = configparser.ConfigParser()
    parser.read(src_ini)

    path_keys = {"model_path", "model_conf", "rnnlm", "rnnlm_conf"}
    for section in parser.sections():
        for key in parser.options(section):
            if key not in path_keys:
                continue
            val = parser.get(section, key).strip()
            if not val:
                continue
            if not os.path.isabs(val):
                parser.set(section, key, os.path.join(cfg.SLIENT_SPEECH_DIR, val))

    fd, path = tempfile.mkstemp(suffix=".ini", prefix="vsr_abs_")
    with os.fdopen(fd, "w") as f:
        parser.write(f)
    return path


# ── Engine ────────────────────────────────────────────────────────────────────

class VSREngine:
    """
    Singleton VSR model.  Call ``load()`` once at application startup.
    ``infer()`` is blocking — run it in a thread-pool executor.
    """

    def __init__(self):
        self.pipeline    = None
        self.loaded      = False
        self.device      = None
        self.model_name  = os.path.splitext(os.path.basename(cfg.CONFIG_PATH))[0]
        self._clahe      = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        self._abs_config = None   # temp file path

    # ── initialisation ────────────────────────────────────────────────────────

    def load(self):
        from pipelines.pipeline import InferencePipeline  # needs sys.path above

        if not os.path.isfile(cfg.CONFIG_PATH):
            raise FileNotFoundError(f"Config not found: {cfg.CONFIG_PATH}")

        self.device = torch.device(
            f"cuda:{cfg.GPU_IDX}"
            if torch.cuda.is_available() and cfg.GPU_IDX >= 0
            else "cpu"
        )

        # Write an absolute-path copy of the .ini so InferencePipeline can
        # resolve model files without needing a specific working directory.
        self._abs_config = _build_absolute_config(cfg.CONFIG_PATH)

        self.pipeline = InferencePipeline(
            self._abs_config,
            device=self.device,
            detector=cfg.DETECTOR,
            face_track=True,
        )
        self.loaded = True
        logger.info(
            "VSR loaded  model=%s  device=%s  detector=%s",
            self.model_name, self.device, cfg.DETECTOR,
        )

    def unload(self):
        self.pipeline = None
        self.loaded   = False
        if self._abs_config and os.path.exists(self._abs_config):
            os.unlink(self._abs_config)
            self._abs_config = None

    # ── preprocessing ─────────────────────────────────────────────────────────

    def preprocess_frame(self, raw_jpeg: bytes) -> np.ndarray | None:
        """
        Decode a JPEG byte string → BGR ndarray with CLAHE applied.
        Returns None if the image cannot be decoded.
        """
        arr   = np.frombuffer(raw_jpeg, np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            return None
        gray     = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        enhanced = self._clahe.apply(gray)
        return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)

    # ── inference ─────────────────────────────────────────────────────────────

    def infer(
        self,
        frames: list[np.ndarray],
        fps: int = cfg.TARGET_FPS,
    ) -> tuple[str, list[tuple[str, float]]]:
        """
        Write *frames* to a temp MP4, run InferencePipeline, clean up.

        Returns ``(transcript, nbest)`` where nbest is a list of
        ``(text, score)`` pairs ordered best-first.

        Raises on any failure so the caller can send an error to the client.
        """
        if not self.loaded:
            raise RuntimeError("VSR engine not loaded — call load() first")
        if len(frames) < cfg.MIN_FRAMES:
            raise ValueError(
                f"Too few frames: {len(frames)} < {cfg.MIN_FRAMES} (1 second)"
            )

        h, w = frames[0].shape[:2]

        fd, tmp_path = tempfile.mkstemp(suffix=".mp4", prefix="vsr_clip_")
        os.close(fd)
        try:
            writer = cv2.VideoWriter(
                tmp_path,
                cv2.VideoWriter_fourcc(*"mp4v"),
                float(fps),
                (w, h),
                True,  # colour BGR
            )
            for frame in frames:
                writer.write(frame)
            writer.release()

            transcript, nbest = self.pipeline(tmp_path)
            return transcript, nbest

        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


# ── module-level singleton ────────────────────────────────────────────────────
engine = VSREngine()
