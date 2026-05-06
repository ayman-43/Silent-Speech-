# Silent Speech — Backend

FastAPI server that accepts webcam frames over WebSocket, runs the LRS3 VSR
model, corrects the output with qwen3:4b, and streams the result back.

## Setup

Install the extra deps into the existing slient-speech venv (do this once):

```powershell
cd ..\slient-speech
uv pip install -r ..\backend\requirements.txt
```

## Run

```powershell
cd ..\slient-speech
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Or from the repo root with the full path:

```powershell
slient-speech\.venv\Scripts\python.exe -m uvicorn backend.main:app `
    --host 0.0.0.0 --port 8000 --app-dir backend
```

Interactive API docs: http://localhost:8000/docs

## Environment variables

| Variable       | Default                     | Description                          |
|----------------|-----------------------------|--------------------------------------|
| `MODEL_CONFIG` | `LRS3_V_WER19.1.ini`        | Which .ini to load from configs/     |
| `DETECTOR`     | `mediapipe`                 | `mediapipe` or `retinaface`          |
| `GPU_IDX`      | `0`                         | CUDA device index (-1 = CPU)         |
| `LLM_MODEL`    | `qwen3:4b`                  | Ollama model name                    |
| `HOST`         | `0.0.0.0`                   | Bind address                         |
| `PORT`         | `8000`                      | Bind port                            |

## REST API

| Method | Path      | Description                                        |
|--------|-----------|----------------------------------------------------|
| GET    | /health   | Server + model status                              |
| GET    | /models   | List available .ini configs                        |
| POST   | /infer    | Upload a video file, get transcript immediately    |
| WS     | /ws       | Real-time frame streaming                          |

## WebSocket protocol

**Client → server (TEXT — JSON):**
```json
{"type": "start_recording"}
{"type": "stop_recording"}
{"type": "reset_history"}
{"type": "ping"}
```

**Client → server (BINARY):**  
Raw JPEG bytes — one message per frame. Send at ~25 fps while recording.

**Server → client (TEXT — JSON):**
```json
{"type": "ready",             "model": "LRS3_V_WER19.1", "device": "cuda:0"}
{"type": "recording_started", "min_frames": 25}
{"type": "recording_stopped", "frame_count": 62}
{"type": "processing"}
{"type": "result",            "raw": "HELLO WORLD", "corrected": "Hello world.",
                              "candidates": [{"text": "...", "score": -9.2}]}
{"type": "error",             "message": "..."}
{"type": "pong"}
{"type": "history_reset"}
```

## Browser snippet (minimal client)

```js
const ws = new WebSocket('ws://localhost:8000/ws');
const video = document.querySelector('video'); // your webcam element
const canvas = document.createElement('canvas');
canvas.width = 640; canvas.height = 480;
const ctx = canvas.getContext('2d');
let frameTimer = null;

ws.onmessage = e => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'result') {
    console.log('Corrected:', msg.corrected);
    console.log('Raw VSR:  ', msg.raw);
  }
};

function startRecording() {
  ws.send(JSON.stringify({type: 'start_recording'}));
  frameTimer = setInterval(() => {
    ctx.drawImage(video, 0, 0, 640, 480);
    canvas.toBlob(blob => blob.arrayBuffer().then(buf => ws.send(buf)), 'image/jpeg', 0.85);
  }, 1000 / 25);  // 25 fps
}

function stopRecording() {
  clearInterval(frameTimer);
  ws.send(JSON.stringify({type: 'stop_recording'}));
}
```
