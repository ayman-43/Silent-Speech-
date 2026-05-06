"""
Download multilingual VSR model checkpoints.

Models sourced from:
  mpc001/Visual_Speech_Recognition_for_Multiple_Languages
  https://github.com/mpc001/Visual_Speech_Recognition_for_Multiple_Languages

Each language model is ~300-500 MB (model.pth + model.json).

Usage:
  python multilingual/setup_models.py --lang zh
  python multilingual/setup_models.py --lang es fr pt
  python multilingual/setup_models.py --all
  python multilingual/setup_models.py --check
"""

import argparse
import os
import sys

# Google Drive file IDs from mpc001/Visual_Speech_Recognition_for_Multiple_Languages
# Source: https://github.com/mpc001/Visual_Speech_Recognition_for_Multiple_Languages#Model-Zoo
#
# These are the video-only (V) sentence-level models trained on MV-LRS.
# Update these IDs if the upstream repo changes them.
MODEL_GDRIVE = {
    'zh': {
        'model.pth':  '1sS5RZCJVqjR3QHGJWuAkqhJtzV_TJlqV',  # LRW-1000
        'model.json': '1RaLWjp1sZVQjCb5e-6NpT6NzAZNVKf0N',
    },
    'es': {
        'model.pth':  '1vL3pLBIyDQAiPOLjHxJpIz5rqX1oFkID',  # MV-LRS Spanish
        'model.json': '1Cgh2NHoXdK_lM_SoF5RR3CsHZ0JMoAXD',
    },
    'fr': {
        'model.pth':  '1YdD5l_rj7yF3P8AHGy4SinJNGPlbJ0Ck',  # MV-LRS French
        'model.json': '1yDFPXK2g7bBlZTn05C9K6c2i1K-MJLKe',
    },
    'pt': {
        'model.pth':  '1QPwnbDJj5M4Ux-M8PpjSmLfv7g2lUXKB',  # MV-LRS Portuguese
        'model.json': '1r8sOOt1cHkqvjBN_r4bCEOUAYc_wSv6k',
    },
    'ar': {
        'model.pth':  '1fZaJ7p8K3lkDf0M3_RLY0NJtZJm5hCXp',  # MV-LRS Arabic
        'model.json': '1Tw5s1xS6tU9TZ4e7NjD2yGpJ6XSoMQhN',
    },
}

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)  # slient-speech/


def _dest_dir(lang: str) -> str:
    return os.path.join(_ROOT, 'benchmarks', 'multilingual', lang)


def download_lang(lang: str, force: bool = False):
    try:
        import gdown
    except ImportError:
        print('[setup] gdown not installed. Run: pip install gdown')
        sys.exit(1)

    if lang not in MODEL_GDRIVE:
        print(f'[setup] No download entry for lang "{lang}". Check the GitHub README for IDs.')
        return False

    dest = _dest_dir(lang)
    os.makedirs(dest, exist_ok=True)

    all_ok = True
    for filename, gdrive_id in MODEL_GDRIVE[lang].items():
        out_path = os.path.join(dest, filename)
        if os.path.exists(out_path) and not force:
            mb = os.path.getsize(out_path) / 1e6
            print(f'[setup] {lang}/{filename} already exists ({mb:.0f} MB) — skip (use --force to redownload)')
            continue

        url = f'https://drive.google.com/uc?id={gdrive_id}'
        print(f'[setup] Downloading {lang}/{filename} ...')
        try:
            gdown.download(url, out_path, quiet=False)
            mb = os.path.getsize(out_path) / 1e6
            print(f'[setup] {lang}/{filename} -> {mb:.0f} MB  OK')
        except Exception as e:
            print(f'[setup] Download failed for {lang}/{filename}: {e}')
            print(f'[setup] Try manually: gdown "https://drive.google.com/uc?id={gdrive_id}" -O {out_path}')
            all_ok = False

    return all_ok


def check_all():
    from .languages import LANGUAGES, model_is_downloaded
    print('\nMultilingual model status:')
    print(f'  {"Lang":<6} {"Name":<20} {"Status"}')
    print('  ' + '-' * 45)
    for code, info in LANGUAGES.items():
        status = 'downloaded' if model_is_downloaded(code) else 'NOT downloaded'
        if code == 'en':
            status = 'bundled (always available)'
        print(f'  {code:<6} {info["name"]:<20} {status}')
    print()
    print('  Run: python multilingual/setup_models.py --lang zh es fr pt ar')
    print()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--lang', nargs='+', choices=list(MODEL_GDRIVE.keys()),
                        help='Language codes to download')
    parser.add_argument('--all', action='store_true', help='Download all languages')
    parser.add_argument('--check', action='store_true', help='Show download status')
    parser.add_argument('--force', action='store_true', help='Re-download even if files exist')
    args = parser.parse_args()

    if args.check:
        check_all()
        return

    langs = list(MODEL_GDRIVE.keys()) if args.all else (args.lang or [])
    if not langs:
        parser.print_help()
        return

    for lang in langs:
        print(f'\n[setup] === {lang.upper()} ===')
        ok = download_lang(lang, force=args.force)
        if ok:
            print(f'[setup] {lang} ready. Use: python main.py config_filename=configs/multilingual_{lang}.ini lang={lang}')

    print('\n[setup] Done.')


if __name__ == '__main__':
    main()
