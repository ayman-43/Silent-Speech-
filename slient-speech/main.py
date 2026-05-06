import torch
import hydra
from pipelines.pipeline import InferencePipeline
from silent_speech import SilentSpeech


@hydra.main(version_base=None, config_path="hydra_configs", config_name="default")
def main(cfg):
    app = SilentSpeech()

    # RetinaFace gives more accurate lip landmarks than MediaPipe.
    # Falls back to mediapipe via cfg.detector override if needed:
    #   main.py ... detector=mediapipe
    detector = cfg.detector if cfg.detector else "retinaface"

    app.vsr_model = InferencePipeline(
        cfg.config_filename,
        device=torch.device(f"cuda:{cfg.gpu_idx}" if torch.cuda.is_available() and cfg.gpu_idx >= 0 else "cpu"),
        detector=detector,
        face_track=True,
        beam_size_override=cfg.beam_size,
    )

    print("\n\033[48;5;22m\033[97m\033[1m silent-speech ready \033[0m\n")

    app.start_webcam()


if __name__ == '__main__':
    main()
