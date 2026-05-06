import os
import torch
import hydra
from pipelines.pipeline import InferencePipeline
from silent_speech import SilentSpeech
from multilingual import LANGUAGES, get_lang_config, supported_langs
from multilingual.languages import model_is_downloaded


@hydra.main(version_base=None, config_path="hydra_configs", config_name="default")
def main(cfg):
    lang = getattr(cfg, 'lang', 'en')

    if lang not in supported_langs():
        raise ValueError(
            f"Unsupported language '{lang}'. Supported: {supported_langs()}\n"
            f"Download models with: python multilingual/setup_models.py --lang {lang}"
        )

    # config_filename takes explicit precedence; otherwise derive from lang
    config_filename = cfg.config_filename
    if not config_filename:
        config_filename = get_lang_config(lang)

    # Warn if model files are missing (non-English models need downloading)
    if lang != 'en' and not model_is_downloaded(lang):
        lang_info = LANGUAGES[lang]
        print(f"\n[warning] {lang_info['name']} model not found at {lang_info['model_dir']}")
        print(f"[warning] Download it with:")
        print(f"  python multilingual/setup_models.py --lang {lang}\n")

    lang_info = LANGUAGES[lang]
    print(f"\n  Language : {lang_info['name']} ({lang})")
    print(f"  Config   : {config_filename}")
    print(f"  Benchmark: {lang_info['benchmark']}")
    print(f"  Training : {lang_info['training_data']}\n")

    app = SilentSpeech(lang=lang)

    app.vsr_model = InferencePipeline(
        config_filename,
        device=torch.device(f"cuda:{cfg.gpu_idx}" if torch.cuda.is_available() and cfg.gpu_idx >= 0 else "cpu"),
        detector=cfg.detector,
        face_track=True,
        beam_size_override=cfg.beam_size,
    )

    print("\033[48;5;22m\033[97m\033[1m silent-speech ready \033[0m\n")

    app.start_webcam()


if __name__ == '__main__':
    main()
