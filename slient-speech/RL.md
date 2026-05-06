# Reinforcement Learning — Can slient-speech Correct Itself?

Yes, but with important caveats on where RL is practical vs where it isn't.

---

## What makes it hard

The core problem: **RL needs a reward signal**, which means knowing what was *actually* said.
In a live lip-reading tool you don't have that — you're trying to predict it.
Without ground truth, you can't compute a reward for the main VSR model.

The model itself (955 MB transformer) is also too large to backprop through in real-time
without serious GPU memory.

---

## Where RL actually works in this stack

### 1. Beam search weight tuning (easiest — no retraining)

Add a thumbs up/down key. Each confirmation/rejection is a reward signal for the decode
config (`lm_weight`, `ctc_weight`, `penalty`). Use a simple bandit algorithm to drift these
values toward what produces better outputs for *your* face and speech patterns.
This is pure RL on 3 floats — trivial to implement.

### 2. LLM correction layer with RLHF (moderate effort)

The `qwen3:4b` correction step is the easiest layer to apply RL to.
When you correct its output, that is a `(prompt, bad_output, good_output)` preference pair.
Collect 50–100 of these then run **DPO (Direct Preference Optimization)** to fine-tune a
small LoRA adapter on top of qwen3. The adapter learns *your* correction patterns — e.g.
that "I'M GOING TO" in your context means "alpha forward".

### 3. Personal correction memory (not RL, but highly practical)

Store a dictionary of `{ vsr_output → user_correction }`. Before calling the LLM, check if
the raw VSR output (or a fuzzy match) was corrected before and apply it directly.
Fast, zero compute, compounds over time. Fixes recurring misrecognitions permanently after
the first manual correction.

---

## What won't work

Fine-tuning the VSR transformer (`model.pth`) with RL in real-time:
- The model is too large (955 MB)
- RL for sequence generation (REINFORCE / PPO) has extremely high variance
- You would need thousands of labeled examples to see any improvement

---

## LLM Model Verification

The project uses **`qwen3:4b`** via the Ollama Python SDK (`AsyncClient`).

```python
# silent_speech.py — line 10, 38, 101
from ollama import AsyncClient
self.ollama_client = AsyncClient()

response = await self.ollama_client.chat(
    model='qwen3:4b',
    ...
    options={"think": False}   # thinking mode disabled for lower latency
)
```

The model name is hardcoded. Whatever Ollama has pulled locally as `qwen3:4b` is what runs.
Verify it is pulled by running:

```powershell
ollama list
```

You should see `qwen3:4b` in the output. If not, pull it with:

```powershell
ollama pull qwen3:4b
```

---

## Realistic Roadmap

| Step | What | Effort |
|---|---|---|
| 1 | Add correction key — user presses a key to retype the correct output | 1 hour |
| 2 | Log `(vsr_raw, llm_output, user_correction)` triples to a file | 1 hour |
| 3 | Bandit RL on decode weights using the correction signal | 1 day |
| 4 | Build personal correction memory dict from logged triples | 1 day |
| 5 | DPO fine-tune qwen3 LoRA adapter after ~100 corrections | 1 weekend |

The biggest win for the least work is **steps 2 + 4** — logging corrections and replaying
known mappings. That alone would permanently fix recurring errors like "alpha forward" →
"I'M GOING TO" after the very first correction.
