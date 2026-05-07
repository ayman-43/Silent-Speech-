"""
Silent Speech — FastAPI Backend
================================

REST endpoints
--------------
GET  /health          server + model status
GET  /models          list available model configs
POST /infer           upload a video file, returns transcript

WebSocket
---------
WS   /ws              real-time webcam streaming

WebSocket protocol
------------------
The client alternates between sending JPEG frames (binary) and JSON
control messages (text).

Client → server (TEXT):
  {"type": "start_recording"}
  {"type": "stop_recording"}
  {"type": "reset_history"}      — wipe LLM conversation history
  {"type": "ping"}

Client → server (BINARY):
  Raw JPEG bytes — one message per frame.
  Only consumed when a recording is active.

Server → client (TEXT):
  {"type": "ready",             "model": "LRS3_V_WER19.1", "device": "cuda:0"}
  {"type": "recording_started", "min_frames": 25}
  {"type": "recording_stopped", "frame_count": 62}
  {"type": "processing"}
  {"type": "result",            "raw": "HELLO WORLD",
                                "corrected": "Hello world.",
                                "candidates": [{"text": "...", "score": -9.2}, ...]}
  {"type": "error",             "message": "..."}
  {"type": "pong"}
  {"type": "history_reset"}
"""

import asyncio
import json
import logging
import os
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

try:
    from . import config as cfg
    from . import vsr
    from . import llm
except ImportError:
    import config as cfg  # type: ignore[no-redef]
    import vsr            # type: ignore[no-redef]
    import llm            # type: ignore[no-redef]

# ── logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("silent-speech")

# ── thread pool for blocking inference ────────────────────────────────────────
# Only 1 worker because inference is GPU-bound; serialise requests.
_pool = ThreadPoolExecutor(max_workers=1)

# Asyncio semaphore mirrors the pool limit inside the event loop.
_infer_sem: asyncio.Semaphore  # created inside lifespan (needs running loop)


# ── lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _infer_sem
    _infer_sem = asyncio.Semaphore(1)

    logger.info("Loading VSR model …")
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(_pool, vsr.engine.load)
    logger.info("VSR model ready.")

    yield

    logger.info("Shutting down …")
    vsr.engine.unload()
    _pool.shutdown(wait=False)


# ── app ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Silent Speech API",
    description=(
        "Real-time lip-reading backend. "
        "Send webcam frames over WebSocket, receive corrected transcripts."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── REST endpoints ────────────────────────────────────────────────────────────

@app.get("/health", tags=["Meta"])
async def health():
    """Server and model status."""
    e = vsr.engine
    return {
        "status":       "ok",
        "model_loaded": e.loaded,
        "model":        e.model_name,
        "device":       str(e.device) if e.device else None,
        "detector":     cfg.DETECTOR,
        "llm":          cfg.LLM_MODEL,
    }


@app.get("/models", tags=["Meta"])
async def list_models():
    """All available model .ini configs."""
    return {"configs": cfg.available_configs()}


@app.post("/infer", tags=["Inference"])
async def infer_upload(file: UploadFile = File(...)):
    """
    Upload a video file (mp4 / webm / avi / …).
    Returns raw transcript + LLM-corrected text + n-best candidates.
    """
    e = vsr.engine
    if not e.loaded:
        raise HTTPException(503, "Model not loaded yet — try again in a moment")

    data   = await file.read()
    suffix = os.path.splitext(file.filename or ".mp4")[1] or ".mp4"

    fd, tmp_path = tempfile.mkstemp(suffix=suffix, prefix="upload_")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)

        loop = asyncio.get_event_loop()
        async with _infer_sem:
            transcript, nbest = await loop.run_in_executor(
                _pool, lambda: e.pipeline(tmp_path)
            )
    except Exception as exc:
        logger.exception("Upload inference failed")
        raise HTTPException(500, str(exc))
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    corrector = llm.make_corrector()
    corrected = await corrector.correct(transcript, nbest)

    return {
        "raw":        transcript,
        "corrected":  corrected,
        "candidates": [{"text": t, "score": round(s, 3)} for t, s in nbest],
    }


# ── WebSocket session ─────────────────────────────────────────────────────────

class _Session:
    """All state for one connected WebSocket client."""

    def __init__(self):
        self.recording: bool             = False
        self.frames:    list[np.ndarray] = []
        self.corrector: llm.LLMCorrector = llm.make_corrector()

    def start(self):
        self.frames    = []
        self.recording = True

    def stop(self) -> int:
        self.recording = False
        return len(self.frames)

    def push_frame(self, raw_jpeg: bytes) -> bool:
        """Preprocess and buffer one JPEG frame. Returns False on bad data."""
        frame = vsr.engine.preprocess_frame(raw_jpeg)
        if frame is None:
            return False
        self.frames.append(frame)
        return True

    def take_frames(self) -> list[np.ndarray]:
        """Return buffered frames and clear the buffer."""
        out, self.frames = self.frames, []
        return out


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    session = _Session()
    loop    = asyncio.get_event_loop()

    async def send(payload: dict):
        await websocket.send_text(json.dumps(payload))

    try:
        # Announce readiness
        await send({
            "type":   "ready",
            "model":  vsr.engine.model_name,
            "device": str(vsr.engine.device) if vsr.engine.device else "cpu",
        })

        while True:
            # receive() handles both text and binary and disconnect cleanly
            msg = await websocket.receive()

            # ── disconnect ────────────────────────────────────────────────────
            if msg["type"] == "websocket.disconnect":
                break

            # ── binary: one JPEG frame ────────────────────────────────────────
            raw_bytes = msg.get("bytes")
            if raw_bytes:
                if session.recording:
                    ok = session.push_frame(raw_bytes)
                    if not ok:
                        logger.debug("Skipped undecodable frame")
                continue

            # ── text: JSON control command ────────────────────────────────────
            raw_text = msg.get("text", "")
            if not raw_text:
                continue

            try:
                cmd = json.loads(raw_text)
            except json.JSONDecodeError:
                await send({"type": "error", "message": "Malformed JSON"})
                continue

            cmd_type = cmd.get("type", "")

            # ── start recording ───────────────────────────────────────────────
            if cmd_type == "start_recording":
                session.start()
                logger.info("Recording started")
                await send({"type": "recording_started", "min_frames": cfg.MIN_FRAMES})

            # ── stop recording + infer ────────────────────────────────────────
            elif cmd_type == "stop_recording":
                n_frames = session.stop()
                logger.info("Recording stopped  frames=%d", n_frames)
                await send({"type": "recording_stopped", "frame_count": n_frames})

                if n_frames < cfg.MIN_FRAMES:
                    await send({
                        "type":    "error",
                        "message": (
                            f"Clip too short: {n_frames} frames captured, "
                            f"need at least {cfg.MIN_FRAMES} (~1 second)."
                        ),
                    })
                    continue

                frames = session.take_frames()
                await send({"type": "processing"})

                # Run blocking VSR inference on the thread pool.
                # _infer_sem serialises multiple concurrent clients on the GPU.
                try:
                    async with _infer_sem:
                        transcript, nbest = await loop.run_in_executor(
                            _pool,
                            lambda: vsr.engine.infer(frames, cfg.TARGET_FPS),
                        )
                except Exception as exc:
                    logger.exception("VSR inference failed")
                    await send({"type": "error", "message": f"Inference error: {exc}"})
                    continue

                logger.info("VSR raw output: %s", transcript)

                # LLM correction (async, stays in the event loop)
                corrected = await session.corrector.correct(transcript, nbest)
                logger.info("LLM corrected:  %s", corrected)

                await send({
                    "type":       "result",
                    "raw":        transcript,
                    "corrected":  corrected,
                    "candidates": [
                        {"text": t, "score": round(s, 3)} for t, s in nbest
                    ],
                })

            # ── utility commands ──────────────────────────────────────────────
            elif cmd_type == "reset_history":
                session.corrector.reset()
                await send({"type": "history_reset"})

            elif cmd_type == "ping":
                await send({"type": "pong"})

            else:
                await send({"type": "error", "message": f"Unknown command: {cmd_type!r}"})

    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception:
        logger.exception("Unhandled WebSocket error")
        try:
            await send({"type": "error", "message": "Internal server error"})
        except Exception:
            pass


# ── entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=cfg.HOST,
        port=cfg.PORT,
        reload=False,       # reload breaks GPU model re-init
        log_level="info",
    )
