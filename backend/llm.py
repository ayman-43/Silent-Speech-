"""
Async LLM post-processor using qwen3:4b via Ollama.

Each WebSocket session gets its own LLMCorrector instance so conversation
history is isolated between clients.  The module-level ``make_corrector()``
factory is the only public API main.py should use.
"""

import asyncio
import logging

from ollama import AsyncClient
from pydantic import BaseModel

import config as cfg

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a post-processor for a visual speech recognition (lip-reading) system.
The model watches silent video of a person speaking and outputs beam-search hypotheses.
Your job is to recover the most plausible thing the person actually said.

━━━ VISUALLY CONFUSABLE PHONEME GROUPS ━━━
These sounds look IDENTICAL on the lips — the model cannot distinguish them:
  • B  P  M       (bilabials — lips pressed together)
  • F  V           (labiodentals — upper teeth on lower lip)
  • TH  S  Z       (dentals/sibilants — tongue near teeth)
  • D  T  N  L     (alveolars — tongue tip behind upper teeth)
  • W  R           (rounding lips)
  • SH  CH  ZH     (palato-alveolars)
  • K  G  NG       (velars — back of mouth, barely visible)
  • silent H        (almost no lip movement — often dropped entirely)

━━━ COMMON LIP-READING ERROR PATTERNS ━━━
1. RANK ERROR   — The best-scoring candidate is often WRONG. Candidates rank 2-5
                  frequently contain the actual utterance. Evaluate ALL candidates.
2. WORD SWAP    — A real word is replaced by a visually similar one:
                  "very" → "ferry", "back" → "pack", "more" → "bore",
                  "they" → "day", "that" → "dat", "what" → "wat",
                  "people" → "peeble", "never" → "lever"
3. CLIPPED      — First 1-2 phonemes missing: "about" appears as "bout",
                  "because" as "cause", "I think" as "think"
4. MERGED WORDS — Word boundary lost: "going to" → "gonna" (or vice versa)
5. SHORT WORDS  — Articles (a, the), pronouns (I, we), prepositions often dropped
                  or wrong: look for missing function words in context.
6. REPEATED     — Stutter in the video can produce duplicated words.

━━━ YOUR TASK ━━━
Step 1 — Evaluate ALL candidates (not just rank 1).
         Which one, possibly with small fixes from the confusion table above,
         forms a grammatically correct, naturally spoken English phrase?
Step 2 — Use CONVERSATION HISTORY (prior turns) for context.
         What topic are they discussing? What would naturally follow?
Step 3 — Apply the minimum edits to make it correct:
         • Fix visually confusable phonemes if the resulting word makes more sense
         • Restore missing function words at the start
         • Fix capitalisation; add terminal punctuation (. ? !)
Step 4 — Do NOT invent words that no candidate contains.
         If all candidates look like garbage, pick the best one and clean it up.

Return 'list_of_changes' (concise, e.g. "rank2 used; 'peeble'→'people'; added 'I'")
and 'corrected_text' (the final clean sentence).\
"""


class _Schema(BaseModel):
    list_of_changes: str
    corrected_text: str


class LLMCorrector:
    """
    Stateful corrector for one WebSocket session.
    Keeps a rolling conversation history so consecutive utterances share context.
    """

    def __init__(self):
        self._client:  AsyncClient      = AsyncClient()
        self._history: list[dict]       = []

    def reset(self):
        """Clear conversation history (e.g. when user starts a new topic)."""
        self._history.clear()

    async def correct(
        self,
        transcript: str,
        nbest: list[tuple[str, float]],
    ) -> str:
        """
        Call the LLM and return corrected text.
        Falls back to a capitalised version of *transcript* on any failure.
        """
        candidates = "\n".join(
            f"  Rank {i+1} (score {score:.2f}): {text if text else '(empty)'}"
            for i, (text, score) in enumerate(nbest)
        )
        user_msg = (
            f"Lip-reading candidates ({len(nbest)} hypotheses, best score first):\n"
            f"{candidates}\n\n"
            f"Top-1 raw text: {nbest[0][0] if nbest else '(none)'}"
        )

        self._history.append({"role": "user", "content": user_msg})
        if len(self._history) > cfg.LLM_HISTORY_MAX:
            self._history = self._history[-cfg.LLM_HISTORY_MAX:]

        try:
            response = await asyncio.wait_for(
                self._client.chat(
                    model=cfg.LLM_MODEL,
                    messages=[
                        {"role": "system", "content": _SYSTEM_PROMPT},
                        *self._history,
                    ],
                    format=_Schema.model_json_schema(),
                    options={"think": False},
                ),
                timeout=20.0,
            )

            try:
                content = response.message.content
            except AttributeError:
                content = response["message"]["content"]

            parsed = _Schema.model_validate_json(content)
            self._history.append({"role": "assistant", "content": content})

            text = parsed.corrected_text.strip()
            if text and text[-1] not in ".?!":
                text += "."
            return text

        except asyncio.TimeoutError:
            logger.warning("LLM timed out after 20 s; falling back to raw transcript")
        except Exception:
            logger.exception("LLM correction failed; falling back to raw transcript")
            fallback = transcript.strip().capitalize()
            if fallback and fallback[-1] not in ".?!":
                fallback += "."
            return fallback


def make_corrector() -> LLMCorrector:
    """Factory — call once per WebSocket connection."""
    return LLMCorrector()
