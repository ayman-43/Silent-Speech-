import cv2
import time
import threading
import tempfile
import os
import asyncio
import wave
import struct
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from ollama import AsyncClient
from pydantic import BaseModel
from pynput import keyboard

try:
    import sounddevice as sd
    _AUDIO_AVAILABLE = True
except ImportError:
    _AUDIO_AVAILABLE = False


class LLMOutput(BaseModel):
    list_of_changes: str
    corrected_text: str


class SilentSpeech:
    def __init__(self):
        self.vsr_model = None
        self.recording = False
        self.recording_lock = threading.Lock()
        self.executor = ThreadPoolExecutor(max_workers=3)

        self.output_prefix = "webcam"
        self.res_factor = 1
        self.fps = 16
        self.frame_interval = 1 / self.fps
        self.tmp_dir = tempfile.mkdtemp()

        # Audio capture state (for AV fusion)
        self.audio_sample_rate = 16000
        self.audio_channels = 1
        self._audio_frames: list[bytes] = []
        self._audio_lock = threading.Lock()

        # 0.5s pre-roll so the start of an utterance isn't clipped
        self.preroll_buffer = deque(maxlen=int(self.fps * 0.5))

        self.kbd_controller = keyboard.Controller()
        self.ollama_client = None  # created inside the event loop in _create_async_resources

        self.loop = asyncio.new_event_loop()
        self._loop_ready = threading.Event()
        self.async_thread = ThreadPoolExecutor(max_workers=1)
        self.async_thread.submit(self._run_event_loop)
        self._loop_ready.wait()

        self.next_sequence_to_type = 0
        self.current_sequence = 0
        self.typing_lock = None
        self.conversation_history = []
        self._init_async_resources()

        # Anchor log next to this file regardless of Hydra's working directory
        self.log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "debug_log.txt")
        self.log_lock = threading.Lock()
        self._write_log(
            f"\n{'='*80}\n"
            f"  SESSION START — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"  Log: {self.log_path}\n"
            f"{'='*80}\n"
        )

        self.hotkey = keyboard.GlobalHotKeys({
            '<alt>': self.toggle_recording
        })
        self.hotkey.start()

    def _run_event_loop(self):
        asyncio.set_event_loop(self.loop)
        self._loop_ready.set()
        self.loop.run_forever()

    def _init_async_resources(self):
        future = asyncio.run_coroutine_threadsafe(
            self._create_async_lock(), self.loop)
        future.result()

    async def _create_async_lock(self):
        self.typing_lock = asyncio.Lock()
        self.typing_condition = asyncio.Condition(self.typing_lock)
        # Create AsyncClient inside the event loop so httpx binds to the right loop
        self.ollama_client = AsyncClient()

    def _write_log(self, text):
        with self.log_lock:
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(text)

    def toggle_recording(self):
        with self.recording_lock:
            self.recording = not self.recording

    # ── Audio capture helpers ────────────────────────────────────────────────

    def _audio_callback(self, indata, frames, time_info, status):
        if status:
            pass
        with self.recording_lock:
            is_rec = self.recording
        if is_rec:
            with self._audio_lock:
                self._audio_frames.append(bytes(indata))

    def _start_audio_stream(self):
        if not _AUDIO_AVAILABLE:
            return None
        try:
            stream = sd.RawInputStream(
                samplerate=self.audio_sample_rate,
                channels=self.audio_channels,
                dtype='int16',
                callback=self._audio_callback,
            )
            stream.start()
            return stream
        except Exception:
            return None

    def _save_audio_wav(self, wav_path: str) -> bool:
        with self._audio_lock:
            frames = list(self._audio_frames)
            self._audio_frames.clear()
        if not frames:
            return False
        with wave.open(wav_path, 'wb') as wf:
            wf.setnchannels(self.audio_channels)
            wf.setsampwidth(2)  # int16 = 2 bytes
            wf.setframerate(self.audio_sample_rate)
            wf.writeframes(b''.join(frames))
        return True

    def _mux_audio_into_video(self, video_path: str, wav_path: str) -> str:
        """Combine wav + mp4 into a new mp4 with both streams using the av library."""
        try:
            import av as pyav
            out_path = video_path.replace('.mp4', '_av.mp4')
            with pyav.open(video_path) as v_in, pyav.open(wav_path) as a_in, pyav.open(out_path, 'w', format='mp4') as out:
                v_stream = out.add_stream(template=v_in.streams.video[0])
                a_stream = out.add_stream('aac', rate=self.audio_sample_rate)
                a_stream.layout = 'mono'
                for pkt in v_in.demux(v_in.streams.video[0]):
                    if pkt.dts is None:
                        continue
                    pkt.stream = v_stream
                    out.mux(pkt)
                for pkt in a_in.demux(a_in.streams.audio[0]):
                    if pkt.dts is None:
                        continue
                    pkt.stream = a_stream
                    out.mux(pkt)
            os.remove(wav_path)
            return out_path
        except Exception:
            return video_path

    async def correct_output_async(self, output, nbest, sequence_num):
        try:
            candidates = "\n".join(
                f"  Rank {i+1} (score {score:.1f}): {text}"
                for i, (text, score) in enumerate(nbest)
            )
            user_msg = f"Beam search candidates (best score first):\n{candidates}"

            self.conversation_history.append({'role': 'user', 'content': user_msg})
            if len(self.conversation_history) > 8:
                self.conversation_history = self.conversation_history[-8:]

            response = await self.ollama_client.chat(
                model='qwen3:4b',
                messages=[
                    {
                        'role': 'system',
                        'content': (
                            "You are correcting output from a lip-reading AI. "
                            "You receive the top-5 beam search candidates ranked by score (less negative = more likely). "
                            "The top-ranked candidate is often WRONG — the real utterance may be in a lower-ranked candidate or a blend of several. "
                            "Pick the most contextually plausible interpretation from the candidates, then fix it.\n\n"
                            "Error patterns to fix:\n"
                            "1. PHONEME CONFUSIONS: b/p/m look identical on lips, as do f/v, th/s/z, w/r/l. "
                            "Swap these when a word looks wrong.\n"
                            "2. OUT-OF-VOCABULARY WORDS: rare words get replaced by visually similar common words. "
                            "Use context to restore the intended word.\n"
                            "3. CLIPPED START: the first syllable is often missing. If a candidate looks like the tail "
                            "of a phrase, reconstruct it from conversation history.\n\n"
                            "Rules: stay close to what was actually said — do not invent words. "
                            "Correct capitalisation. End with '.', '?', or '!'. "
                            "Return 'list_of_changes' (brief) and 'corrected_text'."
                        )
                    },
                    *self.conversation_history,
                ],
                format=LLMOutput.model_json_schema(),
                options={"think": False},
            )

            # Support both new (object) and old (dict) ollama library response formats
            try:
                content = response.message.content
            except AttributeError:
                content = response['message']['content']

            chat_output = LLMOutput.model_validate_json(content)

            self.conversation_history.append({'role': 'assistant', 'content': content})

            chat_output.corrected_text = chat_output.corrected_text.strip()
            if chat_output.corrected_text and chat_output.corrected_text[-1] not in '.?!':
                chat_output.corrected_text += '.'
            chat_output.corrected_text += ' '

            self._write_log(
                f"[LLM CORRECTION — qwen3:4b]\n"
                f"  Candidates:\n{candidates}\n"
                f"  Changes: {chat_output.list_of_changes}\n"
                f"  Output : {chat_output.corrected_text.strip()}\n\n"
            )

            async with self.typing_condition:
                while self.next_sequence_to_type != sequence_num:
                    await self.typing_condition.wait()
                self.kbd_controller.type(chat_output.corrected_text)
                self.next_sequence_to_type += 1
                self.typing_condition.notify_all()

            return chat_output.corrected_text

        except Exception as e:
            import traceback
            self._write_log(
                f"[LLM ERROR — sequence {sequence_num}]\n"
                f"  {type(e).__name__}: {e}\n"
                f"{traceback.format_exc()}\n\n"
            )
            # Fall back: type the raw top-1 in lowercase so output isn't lost
            fallback = output.lower() + '. '
            async with self.typing_condition:
                while self.next_sequence_to_type != sequence_num:
                    await self.typing_condition.wait()
                self.kbd_controller.type(fallback)
                self.next_sequence_to_type += 1
                self.typing_condition.notify_all()
            return fallback

    def perform_inference(self, video_path):
        # Apply current bandit config before running beam search
        transcript, nbest = self.vsr_model(video_path)
        print(f"\n\033[48;5;21m\033[97m\033[1m RAW OUTPUT \033[0m: {transcript}\n")

        sequence_num = self.current_sequence
        self.current_sequence += 1

        # Log VSR stage immediately — before waiting on LLM
        dc = self.vsr_model.decode_config if self.vsr_model else {}
        beam_lines = "\n".join(
            f"    Rank {i+1}  (score: {score:>8.2f})  {text}"
            for i, (text, score) in enumerate(nbest)
        )
        self._write_log(
            f"\n{'='*80}\n"
            f"  UTTERANCE #{sequence_num + 1} — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"{'='*80}\n\n"
            f"[LRS3 VSR — BEAM SEARCH + LANGUAGE MODEL]\n"
            f"  lm_weight: {dc.get('lm_weight','?')}   "
            f"ctc_weight: {dc.get('ctc_weight','?')}   "
            f"penalty: {dc.get('penalty','?')}   "
            f"beam_size: {dc.get('beam_size','?')}\n\n"
            f"{beam_lines}\n\n"
        )

        asyncio.run_coroutine_threadsafe(
            self.correct_output_async(transcript, nbest, sequence_num),
            self.loop
        )

        return {"output": transcript, "video_path": video_path}

    def start_webcam(self):
        cap = cv2.VideoCapture(0)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640 // self.res_factor)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480 // self.res_factor)
        frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        audio_stream = self._start_audio_stream()
        av_mode = audio_stream is not None and self.vsr_model is not None and getattr(self.vsr_model, 'modality', 'video') == 'audiovisual'

        last_frame_time = time.time()
        futures = []
        output_path = None
        out = None
        frame_count = 0

        while True:
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                for file in os.listdir(self.tmp_dir):
                    if file.startswith(self.output_prefix) and file.endswith('.mp4'):
                        os.remove(os.path.join(self.tmp_dir, file))
                break

            current_time = time.time()
            if current_time - last_frame_time >= self.frame_interval:
                ret, frame = cap.read()
                if ret:
                    gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

                    with self.recording_lock:
                        is_recording = self.recording

                    if is_recording:
                        if out is None:
                            output_path = os.path.join(
                                self.tmp_dir,
                                self.output_prefix + str(time.time_ns() // 1_000_000) + '.mp4'
                            )
                            out = cv2.VideoWriter(
                                output_path,
                                cv2.VideoWriter_fourcc(*'mp4v'),
                                self.fps,
                                (frame_width, frame_height),
                                False
                            )
                            # flush pre-roll and reset audio buffer for this utterance
                            with self._audio_lock:
                                self._audio_frames.clear()
                            for preroll_frame in self.preroll_buffer:
                                out.write(preroll_frame)
                            frame_count += len(self.preroll_buffer)
                            self.preroll_buffer.clear()

                        out.write(gray_frame)
                        last_frame_time = current_time
                        frame_count += 1

                        display = gray_frame.copy()
                        cv2.circle(display, (frame_width - 20, 20), 10, 255, -1)
                        cv2.putText(display, "REC", (frame_width - 65, 26),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, 255, 2)
                        cv2.imshow('silent-speech', cv2.flip(display, 1))

                    elif not is_recording and frame_count > 0:
                        if out is not None:
                            out.release()
                            out = None

                        if frame_count >= self.fps * 1 and output_path is not None:
                            # Mux captured audio into the video file for AV fusion
                            if av_mode:
                                wav_path = output_path.replace('.mp4', '.wav')
                                if self._save_audio_wav(wav_path):
                                    output_path = self._mux_audio_into_video(output_path, wav_path)
                            futures.append(self.executor.submit(self.perform_inference, output_path))
                        elif output_path is not None:
                            os.remove(output_path)

                        output_path = None
                        frame_count = 0

                        cv2.imshow('silent-speech', cv2.flip(gray_frame, 1))
                    else:
                        self.preroll_buffer.append(gray_frame)
                        cv2.imshow('silent-speech', cv2.flip(gray_frame, 1))

            for fut in list(futures):
                if fut.done():
                    result = fut.result()
                    if os.path.exists(result["video_path"]):
                        os.remove(result["video_path"])
                    futures.remove(fut)

        if audio_stream is not None:
            audio_stream.stop()
            audio_stream.close()

        cap.release()
        if out:
            out.release()
        for file in os.listdir(self.tmp_dir):
            try:
                os.remove(os.path.join(self.tmp_dir, file))
            except OSError:
                pass
        os.rmdir(self.tmp_dir)
        cv2.destroyAllWindows()
        self.hotkey.stop()
        self.loop.call_soon_threadsafe(self.loop.stop)
        self.async_thread.shutdown(wait=True)
        self.executor.shutdown(wait=True)
