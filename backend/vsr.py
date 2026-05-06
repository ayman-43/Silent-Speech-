"""
VSR inference engine.

Wraps slient-speech's InferencePipeline for use from the FastAPI backend.
Handles sys.path injection, CWD management (model paths are relative to
slient-speech/), CLAHE preprocessing, and temp-file lifecycle.
"""

import os
import sys
import logging
import tempfile

import cv2
import numpy as np
import torch

import config as cfg

logger = logging.getLogger(__name__)

# Inject slient-speech so its modules (pipelines, espnet, …) are importable.
if cfg.SLIENT_SPEECH_DIR not in sys.path:
    sys.path.insert(0, cfg.SLIENT_SPEECH_DIR)


class VSREngine:
    """Singleton VSR model wrapper.  Call load() once at startup."""

    def __init__(self):
        self.pipeline = None
        self.loaded   = False
        self.device   = None
        self.clahe    = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

    # ── initialisation ────────────────────────────────────────────────────────

    def load(self):
        from pipelines.pipeline import InferencePipeline  # needs slient-speech on path

        self.device = torch.device(
            f"cuda:{cfg.GPU_IDX}"
            if torch.cuda.is_available() and cfg.GPU_IDX >= 0
            else "cpu"
        )

        # Model paths inside the .ini are relative to slient-speech/, so we
        # temporarily switch the working directory before handing them to the
        # pipeline (which passes them straight to torch.load / open).
        old_cwd = os.getcwd()
        os.chdir(cfg.SLIENT_SPEECH_DIR)
        try:
            self.pipeline = InferencePipeline(
                cfg.CONFIG_FILENAME,
                device=self.device,
                detector=cfg.DETECTOR,
                face_track=True,
            )
            self.loaded = True
            logger.info(
                "VSR model loaded  device=%s  detector=%s", self.device, cfg.DETECTOR
            )
        finally:
            os.chdir(old_cwd)

    # ── inference ─────────────────────────────────────────────────────────────

    def preprocess(self, frame_bgr: np.ndarray) -> np.ndarray:
        """CLAHE on the luminance channel, return BGR ready for VideoWriter."""
        gray     = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        enhanced = self.clahe.apply(gray)
        return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)

    def infer(self, frames: list[np.ndarray], fps: int = cfg.TARGET_FPS):
        """
        Write *frames* to a temp MP4, run InferencePipeline, delete the file.

        Returns (transcript: str, nbest: list[(str, float)]) or raises on failure.
        """
        if not self.loaded:
            raise RuntimeError("VSR engine not loaded")
        if not frames:
            raise ValueError("No frames supplied")

        h, w = frames[0].shape[:2]

        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".mp4")
        os.close(tmp_fd)
        try:
            out = cv2.VideoWriter(
                tmp_path,
                cv2.VideoWriter_fourcc(*"mp4v"),
                fps,
                (w, h),
                True,  # colour (BGR)
            )
            for frame in frames:
                out.write(frame)
            out.release()

            old_cwd = os.getcwd()
            os.chdir(cfg.SLIENT_SPEECH_DIR)
            try:
                transcript, nbest = self.pipeline(tmp_path)
            finally:
                os.chdir(old_cwd)

            return transcript, nbest
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


# Module-level singleton — imported by main.py
engine = VSREngine()
