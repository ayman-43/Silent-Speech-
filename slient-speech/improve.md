# Improvements for `slient-speech`

### 1. Recording — Race condition on `frame_count` / `out`

**File:** `silent_speech.py:163–180`

When the Alt key fires `toggle_recording` from the hotkey thread, `self.recording` flips mid-loop. The main loop then reads `frame_count > 0` and accesses `out` without any lock — if the toggle fires between the `out.release()` and the new `VideoWriter` creation, you get a corrupted file or a crash. Fix: use a `threading.Lock` to guard `recording`, `out`, and `frame_count`.

---

### 2. Futures cleanup loop is broken

**File:** `silent_speech.py:184–190`

```python
for fut in futures:
    if fut.done():
        ...
        futures.remove(fut)  # mutating a list while iterating it
    else:
        break               # stops checking if ANY future is still running
```

Both bugs together: early `break` means completed futures after the first pending one are never cleaned up, and removing during iteration skips entries. Fix: iterate a copy and drop the `break`.

```python
for fut in list(futures):
    if fut.done():
        result = fut.result()
        os.remove(result["video_path"])
        futures.remove(fut)
```

---

### 3. Inference blocks the single executor thread — no parallelism

**File:** `silent_speech.py:20`, `pipeline.py`

`ThreadPoolExecutor(max_workers=1)` means a second recording made while inference is running queues behind it. For a real-time tool that's a growing backlog. Raise to 2–3 workers, or better yet: since VSR inference is GPU-bound and the LLM call is I/O-bound, they can safely run concurrently.

---

### 4. No minimum silence gap — accidental micro-clips

**File:** `silent_speech.py:167`

The current guard is `frame_count >= fps * 2` (≥ 2 seconds). That's fine but there's nothing preventing a user from double-tapping Alt and producing a 0-frame clip that hits the `os.remove` path with a `None` path if `out` was never opened. Add a `None` check before `os.remove`.

---

### 5. Temporary `.mp4` files leak on crash

**File:** `silent_speech.py:135–138`

The `q`-key cleanup scans `os.listdir()` for files starting with `"webcam"` — but only in the current working directory, and only on a clean `q`-key exit. A crash (Ctrl+C, CUDA OOM, etc.) leaves them behind. Fix: write temp files to `tempfile.mkdtemp()` and wrap startup in a context manager or `atexit` handler.

---

### 6. LLM prompt doesn't use `thinking: false` / streaming

**File:** `silent_speech.py:62–87`

`qwen3:4b` with Ollama defaults to extended thinking mode, which adds latency and produces `<think>` blocks you then have to strip (they won't validate cleanly against `LLMOutput.model_json_schema()`). Add `options={"think": False}` to the `chat()` call to get faster, deterministic structured output:

```python
response = await self.ollama_client.chat(
    model='qwen3:4b',
    messages=[...],
    format=LLMOutput.model_json_schema(),
    options={"think": False}
)
```

---

### 7. Face detection always uses full-range first, then falls back

**File:** `detectors/mediapipe/detector.py:21–24`

The full-range model is slower and designed for subjects > 2m from camera — most webcam users are 50–80 cm away. Swap the priority: try `short_range_detector` first, fall back to `full_range_detector`. Saves ~20ms per frame during detection.

---

### 8. Grayscale frame written to VideoWriter but display shows garbled output

**File:** `silent_speech.py:146–158`

`cv2.imdecode(buffer, cv2.IMREAD_GRAYSCALE)` returns a single-channel frame, but `cv2.imshow` and the `VideoWriter` both work correctly with it (isColor=False is set). However `cv2.circle` with `(0,0,0)` black on a dark compressed frame is invisible as a recording indicator. Use white `(255,255,255)` or a red-equivalent grayscale value.

---

### 9. `typing_lock` is initialized to `None` and used before `_init_async_resources` completes

**File:** `silent_speech.py:37–38`

If `_init_async_resources` fails (e.g., event loop isn't running yet), `correct_output_async` will crash with `TypeError: 'NoneType' object is not a context manager`. The event loop thread is submitted to an executor but there's no guarantee it's running before `_init_async_resources` calls `run_coroutine_threadsafe`. Add a small `threading.Event` to gate this:

```python
self._loop_ready = threading.Event()
# in _run_event_loop: set it after asyncio.set_event_loop
self._loop_ready.wait()  # before _init_async_resources
```

---

### 10. No visual feedback on recording state in the window title

**File:** `silent_speech.py:182`

The recording indicator is a small black circle on a black-ish compressed frame — invisible in practice. Use `cv2.putText` to overlay `"● REC"` in white when recording, and `cv2.setWindowTitle` to change the window title, so users have a clear signal.

---

## Priority order

1. Futures cleanup bug (#2) — silent data loss today
2. LLM thinking mode (#6) — biggest latency win
3. Race condition on toggle (#1) — rare but causes crashes
4. Executor parallelism (#3) — UX improvement for fast speakers
