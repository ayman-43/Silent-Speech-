import sys
import torch
import hydra
from pipelines.pipeline import InferencePipeline
from silent_speech import SilentSpeech


@hydra.main(version_base=None, config_path="hydra_configs", config_name="default")
def main(cfg):
    # ── Device selection banner ───────────────────────────────────────────────
    if torch.cuda.is_available() and cfg.gpu_idx >= 0:
        device = torch.device(f"cuda:{cfg.gpu_idx}")
        gpu_name = torch.cuda.get_device_name(cfg.gpu_idx)
        mem_total = torch.cuda.get_device_properties(cfg.gpu_idx).total_memory / 1024**2
        print(f"\n\033[48;5;27m\033[97m\033[1m  CUDA  \033[0m  GPU {cfg.gpu_idx}: {gpu_name}  ({mem_total:.0f} MB VRAM)", flush=True)
    else:
        device = torch.device("cpu")
        if cfg.gpu_idx >= 0:
            print(f"\n\033[48;5;88m\033[97m\033[1m  WARNING  \033[0m  CUDA not available — falling back to CPU", flush=True)
        else:
            print(f"\n\033[48;5;240m\033[97m\033[1m  CPU  \033[0m  Running on CPU (gpu_idx={cfg.gpu_idx})", flush=True)

    assert cfg.config_filename, (
        "config_filename is required. Example:\n"
        "  uv run main.py config_filename=./configs/LRS3_V_WER19.1.ini detector=mediapipe"
    )

    app = SilentSpeech()

    print(f"\n\033[1m[VSR]\033[0m Loading pipeline from {cfg.config_filename} ...", flush=True)
    app.vsr_model = InferencePipeline(
        cfg.config_filename,
        device=device,
        detector=cfg.detector,
        face_track=True,
        beam_size_override=cfg.beam_size,
    )

    print(f"\n\033[48;5;22m\033[97m\033[1m  READY  \033[0m  Alt = start/stop recording   q = quit\n", flush=True)
    app.start_webcam()


if __name__ == '__main__':
    main()
