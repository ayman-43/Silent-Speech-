# silent_speech.py — line 10, 38, 101
from ollama import AsyncClient
self.ollama_client = AsyncClient()

response = await self.ollama_client.chat(
    model='qwen3:4b',
    messages=[
        {"role": "system", "content": "Correct the following visual speech recognition output to standard English:"},
        {"role": "user", "content": transcript}
    ],
    options={"think": False}   # thinking mode disabled for lower latency
)