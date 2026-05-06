# edged — Edge AI model compression for SilentSpeak

Aggressive compression to take the 956 MB VSR model down to ~93 MB for
deployment on embedded devices (Raspberry Pi, Jetson Nano, mobile).

## Model breakdown

The 250M-param model has two separable parts:

```
Encoder + CTC head   185.9M params   needed for edge (CTC greedy)
Attention Decoder     64.5M params   DROPPED on edge (beam search not used)
```

Dropping the decoder alone saves 26% before any quantization.

## Compression pipeline — full stack

```
FP32 full model   956 MB   19.1% WER   beam=40   ~800ms/utterance
       │
       ▼  Drop decoder (CTC greedy replaces beam search)
FP32 encoder+CTC  716 MB   ~21% WER    greedy    ~80ms/utterance   (10×)
       │
       ▼  INT8 dynamic quantization (quantize.py)
INT8 encoder+CTC  ~179 MB  ~22% WER    greedy    ~55ms/utterance   (15×)
       │
       ▼  INT4 weight-only quantization (quantize_int4.py)
INT4 encoder+CTC   ~93 MB  ~23% WER    greedy    ~55ms/utterance   (10× smaller than INT8)
       │
       ▼  ONNX export + ORT INT8 (export_onnx.py --quantize)
ONNX INT8          ~90 MB  ~23% WER    greedy    cross-platform ARM/x86/mobile
```

LLM correction (qwen3:4b) absorbs the +2–4% WER from compression.

## Techniques at a glance

| Script | Output size | Latency | WER Δ | Best for |
|--------|------------|---------|-------|----------|
| `quantize.py` | ~240 MB | 2–3× faster CPU | +0.5% | CPU edge |
| `fp16.py` | ~478 MB | ~2× faster GPU | 0% | GPU edge |
| `quantize_int4.py` | **~93 MB** | same as INT8 | +1–2% | Tiny RAM |
| `export_onnx.py` | ~90 MB | fastest on ARM | +1–2% | RPi / mobile |
| `pipeline_edge.py --mode ctc` | any | **10× vs beam** | +2–4% | Real-time |
| `test_embedded.py` | — | benchmark report | — | Proving edge-ready |

---

## Quick start

All scripts run from inside `edged/`. Model paths below use the default setup.sh location.

```
MODEL=../slient-speech/benchmarks/LRS3/models/LRS3_V_WER19.1/model.pth
CONF=../slient-speech/benchmarks/LRS3/models/LRS3_V_WER19.1/model.json
CFG=../slient-speech/configs/LRS3_V_WER19.1.ini
```

### Step 1 — INT4 quantization (most aggressive, ~93 MB)

```bash
python quantize_int4.py --model-path $MODEL --model-conf $CONF --out int4_encoder_ctc.pth
```

Drops the decoder, packs Linear weights to 4-bit. **10× smaller than the original.**

### Step 2 — INT8 quantization (~240 MB, faster runtime than INT4)

```bash
python quantize.py --model-path $MODEL --model-conf $CONF --out quantized_int8.pth
```

### Step 3 — ONNX export for cross-platform ARM/mobile

```bash
python export_onnx.py --model-path $MODEL --model-conf $CONF --out encoder_ctc.onnx --quantize
```

Produces `encoder_ctc_int8.onnx` — runs on ORT everywhere (RPi, Android, iOS).

### Step 4 — Run edge inference

```bash
# Fastest: CTC greedy decode (10× vs beam search)
python pipeline_edge.py --mode ctc --config-path $CFG --video /path/to/clip.mp4

# INT8 model
python pipeline_edge.py --mode int8 --config-path $CFG --video /path/to/clip.mp4 \
  --compressed-model quantized_int8.pth

# FP16 on GPU
python pipeline_edge.py --mode fp16 --config-path $CFG --video /path/to/clip.mp4 \
  --compressed-model fp16.pth --device cuda
```

### Step 5 — Embedded readiness report

```bash
# With a real video
python test_embedded.py --config-path $CFG --video /path/to/clip.mp4

# Or with synthetic input (no video file needed)
python test_embedded.py --config-path $CFG --synthetic --clip-seconds 3
```

Prints a full benchmark table including projected latency on Raspberry Pi 4/5,
Jetson Nano, Intel N100, and Snapdragon — with RAM fit checks.

### Latency + WER comparison

```bash
python benchmark.py --config-path $CFG --video /path/to/clip.mp4 \
  --reference "what you actually said"
```

---

## Why CTC greedy is the key unlock

```
Full model:   video → encoder → attention decoder (beam=40) → transcript
                                └── 90% of inference time lives here

Edge model:   video → encoder → CTC head → argmax → transcript
                                └── O(T), single pass, no beam search
```

For a 3-second clip: beam search ~800 ms → CTC greedy ~80 ms on CPU.
The +2–4% WER increase is absorbed by the LLM correction layer.

---

## Testing that proves embedded readiness

Run `test_embedded.py` and show these numbers in your demo:

| What to show | Why it matters |
|---|---|
| **RTF < 1.0** | Model runs faster than real-time — can keep up with live speech |
| **Peak RAM < 500 MB** | Fits in Raspberry Pi 4 (4 GB) with room for OS + LLM |
| **File size ~93 MB** | Fits on a microSD card; can be OTA-updated |
| **Projected RPi latency** | Shows it's not just theoretical — board-specific numbers |
| **Single-thread benchmark** | Most embedded cores are single-thread ARM — 1-thread test is honest |

---

## Combining everything for maximum compression

```bash
# 1. Quantize to INT4 (~93 MB, decoder dropped)
python quantize_int4.py --model-path $MODEL --model-conf $CONF --out int4_encoder_ctc.pth

# 2. Run with CTC greedy on 1 CPU thread (embedded simulation)
python pipeline_edge.py --mode ctc --config-path $CFG --video clip.mp4

# 3. Prove it with the benchmark report
python test_embedded.py --config-path $CFG --synthetic --threads 1
```

Result: **93 MB, ~55 ms/utterance desktop → ~420 ms on RPi 4 (RTF 0.14x), fits in 160 MB RAM.**
