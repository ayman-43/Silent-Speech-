import cv2
import time
import threading
import tempfile
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
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

    def toggle_recording(self):
        with self.recording_lock:
            self.recording = not self.recording

    async def correct_output_async(self, output, sequence_num):
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
                        "You are an assistant that helps make corrections to the output of a lipreading model. "
                        "The text you will receive was transcribed using a video-to-text system that attempts to lipread "
                        "the subject speaking in the video, so the text will likely be imperfect. The input text will also "
                        "be in all-caps, although your response should be capitalized correctly and should NOT be in all-caps.\n\n"
                        "Lip-reading commonly confuses visually similar phonemes: b/p/m (same lip closure), "
                        "f/v (same teeth-lip contact), th with s or z, and w with r. When a word looks wrong, "
                        "check these substitutions first before assuming any other error.\n\n"
                        "If something seems unusual, assume it was mistranscribed. Do your best to infer the words actually spoken, "
                        "and make changes to the mistranscriptions in your response. Do not add more words or content, just change "
                        "the ones that seem to be out of place (and, therefore, mistranscribed). Do not change even the wording of "
                        "sentences, just individual words that look nonsensical in the context of all of the other words in the sentence.\n\n"
                        "Also, add correct punctuation to the entire text. ALWAYS end each sentence with the appropriate sentence "
                        "ending: '.', '?', or '!'.\n\n"
                        "Return the corrected text in the format of 'list_of_changes' and 'corrected_text'."
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
        if chat_output.corrected_text[-1] not in ['.', '?', '!']:
            chat_output.corrected_text += '.'
        chat_output.corrected_text += ' '

        async with self.typing_condition:
            while self.next_sequence_to_type != sequence_num:
                await self.typing_condition.wait()
            self.kbd_controller.type(chat_output.corrected_text)
            self.next_sequence_to_type += 1
            self.typing_condition.notify_all()

        return chat_output.corrected_text

    def perform_inference(self, video_path):
        output = self.vsr_model(video_path)
        print(f"\n\033[48;5;21m\033[97m\033[1m RAW OUTPUT \033[0m: {output}\n")

        sequence_num = self.current_sequence
        self.current_sequence += 1

        asyncio.run_coroutine_threadsafe(
            self.correct_output_async(output, sequence_num),
            self.loop
        )

        return {"output": output, "video_path": video_path}

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

                        if frame_count >= self.fps * 2 and output_path is not None:
                            futures.append(self.executor.submit(self.perform_inference, output_path))
                        elif output_path is not None:
                            os.remove(output_path)

                        output_path = None
                        frame_count = 0

                        cv2.imshow('silent-speech', cv2.flip(gray_frame, 1))
                    else:
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
