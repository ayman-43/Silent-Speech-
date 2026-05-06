import cv2
import time
import threading
import tempfile
import os
import asyncio
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from ollama import AsyncClient
from pydantic import BaseModel
from pynput import keyboard


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

        # 0.5s pre-roll: always keep the last 8 frames so the start of an
        # utterance isn't clipped when the user presses Alt mid-word.
        self.preroll_buffer = deque(maxlen=int(self.fps * 0.5))

        self.kbd_controller = keyboard.Controller()
        self.ollama_client = AsyncClient()

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

        self.log_path = "debug_log.txt"
        self.log_lock = threading.Lock()
        # Write session header
        self._write_log(
            f"\n{'='*80}\n"
            f"  SESSION START — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
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

    def _write_log(self, text):
        with self.log_lock:
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(text)

    def toggle_recording(self):
        with self.recording_lock:
            self.recording = not self.recording

    async def correct_output_async(self, output, nbest, sequence_num):
        self.conversation_history.append({
            'role': 'user',
            'content': f"Transcription:\n\n{output}"
        })
        # Rolling window of last 4 exchanges (8 messages) for context
        if len(self.conversation_history) > 8:
            self.conversation_history = self.conversation_history[-8:]

        response = await self.ollama_client.chat(
            model='qwen3:4b',
            messages=[
                {
                    'role': 'system',
                    'content': (
                        "You are an assistant that corrects output from a lip-reading AI model. "
                        "The text was transcribed by reading lip movements from video — it will be imperfect and in ALL-CAPS. "
                        "Your response should be correctly capitalised and NOT in all-caps.\n\n"
                        "Known error patterns — check these in order:\n"
                        "1. CLIPPED START: The beginning of an utterance is often missing. If the output looks like "
                        "the tail end of a sentence (e.g. just 'YOU', 'DO', 'GOING TO'), the full phrase was longer. "
                        "Use conversation history to reconstruct the most likely full phrase.\n"
                        "2. OUT-OF-VOCABULARY WORDS: Technical terms, proper nouns, commands, and uncommon words "
                        "will be substituted with visually similar common English words. For example 'alpha' might "
                        "become 'after', 'forward' might become 'for that'. Reconstruct the intended word from context.\n"
                        "3. PHONEME CONFUSIONS: b/p/m are identical lip shapes, as are f/v, and th/s/z, and w/r. "
                        "When a word looks wrong, try these substitutions first.\n\n"
                        "Rules: Do not add words that were not spoken. Only fix words that are clearly wrong. "
                        "Add correct punctuation. End every sentence with '.', '?', or '!'.\n\n"
                        "Return 'list_of_changes' and 'corrected_text'."
                    )
                },
                *self.conversation_history,
            ],
            format=LLMOutput.model_json_schema(),
            options={"think": False}
        )

        chat_output = LLMOutput.model_validate_json(response['message']['content'])

        self.conversation_history.append({
            'role': 'assistant',
            'content': response['message']['content']
        })

        chat_output.corrected_text = chat_output.corrected_text.strip()
        if chat_output.corrected_text and chat_output.corrected_text[-1] not in ['.', '?', '!']:
            chat_output.corrected_text += '.'
        chat_output.corrected_text += ' '

        # Log LLM stage
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
            f"  lm_weight: {dc.get('lm_weight', '?')}   "
            f"ctc_weight: {dc.get('ctc_weight', '?')}   "
            f"penalty: {dc.get('penalty', '?')}   "
            f"beam_size: {dc.get('beam_size', '?')}\n\n"
            f"{beam_lines}\n\n"
            f"[LLM CORRECTION — qwen3:4b]\n"
            f"  Input  : {output}\n"
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

    def perform_inference(self, video_path):
        transcript, nbest = self.vsr_model(video_path)
        print(f"\n\033[48;5;21m\033[97m\033[1m RAW OUTPUT \033[0m: {transcript}\n")

        sequence_num = self.current_sequence
        self.current_sequence += 1

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
                            # Flush pre-roll so the start of the utterance isn't clipped
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

                        # 1-second minimum — short phrases like "how are you" are ~1.5s
                        if frame_count >= self.fps * 1 and output_path is not None:
                            futures.append(self.executor.submit(self.perform_inference, output_path))
                        elif output_path is not None:
                            os.remove(output_path)

                        output_path = None
                        frame_count = 0

                        cv2.imshow('silent-speech', cv2.flip(gray_frame, 1))
                    else:
                        # Not recording — keep filling the pre-roll buffer
                        self.preroll_buffer.append(gray_frame)
                        cv2.imshow('silent-speech', cv2.flip(gray_frame, 1))

            for fut in list(futures):
                if fut.done():
                    result = fut.result()
                    if os.path.exists(result["video_path"]):
                        os.remove(result["video_path"])
                    futures.remove(fut)

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
