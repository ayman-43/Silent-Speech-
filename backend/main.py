"""
Silent-Speech FastAPI backend.

REST endpoints
--------------
GET  /health          → server + model status
GET  /config          → current model/decode configuration
POST /infer           → upload a video file, get transcript immediately

WebSocket endpoint
------------------
WS   /ws              → real-time frame streaming + result delivery

WebSocket protocol
------------------
Client → server (TEXT / JSON):
  {"type": "start_recording"}
  {"type": "stop_recording"}
  {"type": "reset_history"}     clears LLM conversation history
  {"type": "ping"}

Client → server (BINARY):
  Raw JPEG bytes — one frame per message.  Send only while recording.

Server → client (TEXT / JSON):
  {"type": "ready",             "model": "<name>", "device": "<cpu|cuda:0>"}
  {"type": "recording_started", "min_frames": N}
  {"type": "recording_stopped", "frame_count": N}
  {"type": "processing"}
  {"type": "result",            "raw": "...", "corrected": "...",
                                "candidates": [{"text": "...", "score": -12.3}, ...]}
  {"type": "error",             "message": "..."}
  {"type": "pong"}
"""

import asyncio
import base64
import io
import json
import logging
import os
import tempfile
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config as cfg
import vsr as vsr_module
import llm as llm_module

# ── logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger("backend")

# Thread pool for blocking VSR inference (keeps the event loop free)
_executor = ThreadPoolExecutor(max_workers=2)


# ── lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Loading VSR model …")
    vsr_module.engine.load()
    logger.info("VSR model ready.  Starting server.")
    yield
    _executor.shutdown(wait=False)


# ── app ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Silent Speech API",
    description="Real-time lip-reading backend powered by LRS3 VSR + qwen3:4b.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── REST endpoints ────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    engine = vsr_module.engine
    return {
        "status":       "ok",
        "model_loaded": engine.loaded,
        "model":        cfg.MODEL_NAME,
        "device":       str(engine.device) if engine.device else None,
        "detector":     cfg.DETECTOR,
    }


@app.get("/config")
async def get_config():
    import configparser
    parser = configparser.ConfigParser()
    parser.read(cfg.CONFIG_FILENAME)
    return {section: dict(parser[section]) for section in parser.sections()}


@app.post("/infer")
async def infer_file(file: UploadFile = File(...)):
    """
    Upload a video file (mp4 / webm / avi / …), receive a transcript.
    Useful for testing without a live WebSocket session.
    """
    engine = vsr_module.engine
    if not engine.loaded:
        raise HTTPException(status_code=503, detail="Model not loaded yet")

    data = await file.read()
    suffix = os.path.splitext(file.filename or ".mp4")[1] or ".mp4"

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(tmp_fd, "wb") as f:
            f.write(data)

        loop = asyncio.get_event_loop()
        transcript, nbest = await loop.run_in_executor(
            _executor, lambda: engine.pipeline(tmp_path)
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    corrected = await llm_module.corrector.correct(transcript, nbest)
    return {
        "raw":        transcript,
        "corrected":  corrected,
        "candidates": [{"text": t, "score": s} for t, s in nbest],
    }


# ── WebSocket session state ───────────────────────────────────────────────────

class _Session:
    """Per-connection state: frame buffer + recording flag."""

    def __init__(self):
        self.recording:   bool            = False
        self.frames:      list[np.ndarray] = []
        self.session_llm: llm_module.LLMCorrector = llm_module.LLMCorrector()

    def reset_recording(self):
        self.frames    = []
        self.recording = False

    def push_jpeg(self, raw_bytes: bytes) -> bool:
        """Decode raw JPEG bytes → BGR ndarray and append.  Returns False on bad frame."""
        arr   = np.frombuffer(raw_bytes, np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            return False
        # preprocess: CLAHE for better lip contrast
        processed = vsr_module.engine.preprocess(frame)
        self.frames.append(processed)
        return True


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    session = _Session()
    engine  = vsr_module.engine

    async def send(obj: dict):
        await websocket.send_text(json.dumps(obj))

    try:
        await send({
            "type":   "ready",
            "model":  cfg.MODEL_NAME,
            "device": str(engine.device) if engine.device else "cpu",
        })

        while True:
            message = await websocket.receive()

            # ── binary: a JPEG frame ──────────────────────────────────────────
            if message["type"] == "websocket.receive" and "bytes" in message and message["bytes"]:
                if session.recording:
                    ok = session.push_jpeg(message["bytes"])
                    if not ok:
                        logger.warning("Received undecodable frame — skipped")
                continue

            # ── text: a control command ───────────────────────────────────────
            if message["type"] == "websocket.receive" and "text" in message:
                try:
                    data = json.loads(message["text"])
                except json.JSONDecodeError:
                    await send({"type": "error", "message": "Invalid JSON"})
                    continue

                cmd = data.get("type", "")

                if cmd == "start_recording":
                    session.reset_recording()
                    session.recording = True
                    await send({"type": "recording_started", "min_frames": cfg.MIN_FRAMES})

                elif cmd == "stop_recording":
                    session.recording = False
                    n = len(session.frames)
                    await send({"type": "recording_stopped", "frame_count": n})

                    if n < cfg.MIN_FRAMES:
                        await send({
                            "type":    "error",
                            "message": f"Too short: {n} frames captured, need at least {cfg.MIN_FRAMES} (1 second).",
                        })
                        continue

                    await send({"type": "processing"})

                    # Copy frames and clear buffer so new recording can start
                    frames_snapshot = list(session.frames)
                    session.frames  = []

                    # Run blocking VSR inference on the thread pool
                    loop = asyncio.get_event_loop()
                    try:
                        transcript, nbest = await loop.run_in_executor(
                            _executor,
                            lambda: engine.infer(frames_snapshot, cfg.TARGET_FPS),
                        )
                    except Exception as exc:
                        logger.exception("Inference error")
                        await send({"type": "error", "message": f"Inference failed: {exc}"})
                        continue

                    logger.info("VSR raw: %s  (n-best: %d)", transcript, len(nbest))

                    # LLM correction (async, runs in event loop)
                    corrected = await session.session_llm.correct(transcript, nbest)

                    await send({
                        "type":       "result",
                        "raw":        transcript,
                        "corrected":  corrected,
                        "candidates": [{"text": t, "score": round(s, 2)} for t, s in nbest],
                    })

                elif cmd == "reset_history":
                    session.session_llm.reset_history()
                    await send({"type": "history_reset"})

                elif cmd == "ping":
                    await send({"type": "pong"})

                else:
                    await send({"type": "error", "message": f"Unknown command: {cmd}"})

            # ── disconnect ────────────────────────────────────────────────────
            elif message["type"] == "websocket.disconnect":
                break

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
        reload=False,      # reload=True breaks GPU model re-init
        log_level="info",
    )
