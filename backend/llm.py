"""
Async LLM post-processor (qwen3:4b via Ollama).

Mirrors the correction logic in slient-speech/silent_speech.py so the
backend produces the same quality of corrected output as the desktop app.
"""

import logging
from ollama import AsyncClient
from pydantic import BaseModel

import config as cfg

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
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


class _LLMOutput(BaseModel):
    list_of_changes: str
    corrected_text: str


class LLMCorrector:
    """Stateful LLM corrector that keeps a rolling conversation history."""

    def __init__(self):
        self._client  = AsyncClient()
        self._history: list[dict] = []

    def reset_history(self):
        self._history.clear()

    async def correct(self, transcript: str, nbest: list[tuple[str, float]]) -> str:
        """
        Given the VSR top transcript and n-best list, return corrected text.
        Falls back to capitalised transcript on any error.
        """
        candidates = "\n".join(
            f"  Rank {i+1} (score {score:.1f}): {text}"
            for i, (text, score) in enumerate(nbest)
        )
        user_msg = f"Beam search candidates (best score first):\n{candidates}"

        self._history.append({"role": "user", "content": user_msg})
        if len(self._history) > cfg.LLM_HISTORY_MAX:
            self._history = self._history[-cfg.LLM_HISTORY_MAX:]

        try:
            response = await self._client.chat(
                model=cfg.LLM_MODEL,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    *self._history,
                ],
                format=_LLMOutput.model_json_schema(),
                options={"think": False},
            )

            try:
                content = response.message.content
            except AttributeError:
                content = response["message"]["content"]

            result = _LLMOutput.model_validate_json(content)
            self._history.append({"role": "assistant", "content": content})

            text = result.corrected_text.strip()
            if text and text[-1] not in ".?!":
                text += "."
            return text

        except Exception:
            logger.exception("LLM correction failed — falling back to raw transcript")
            fallback = transcript.strip().capitalize()
            if fallback and fallback[-1] not in ".?!":
                fallback += "."
            return fallback


# Module-level singleton — one per process, shared across WebSocket sessions.
# Each WebSocket session calls reset_history() to get a clean context window.
corrector = LLMCorrector()
