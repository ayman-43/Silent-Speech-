"""
Language registry for multilingual VSR support.

Models come from:
  - English  : LRS3_V_WER19.1 (already bundled)
  - All others: mpc001/Visual_Speech_Recognition_for_Multiple_Languages
                https://github.com/mpc001/Visual_Speech_Recognition_for_Multiple_Languages

Download models with:
  python multilingual/setup_models.py --lang zh
  python multilingual/setup_models.py --all
"""

import os

_HERE = os.path.dirname(__file__)
_ROOT = os.path.dirname(_HERE)  # slient-speech/

LANGUAGES = {
    'en': {
        'name': 'English',
        'native_name': 'English',
        'config': 'configs/LRS3_V_WER19.1.ini',
        'model_dir': 'benchmarks/LRS3/models/LRS3_V_WER19.1',
        'labels_type': 'unigram5000',
        'benchmark': 'LRS3 WER 19.1%',
        'training_data': 'LRS2 + LRS3 + VoxCeleb2',
        # Visually ambiguous phoneme pairs (same lip shape, different sound)
        'lip_confusions': [
            'b / p / m  (bilabials — lips press together)',
            'f / v      (labiodentals)',
            'th / s / z (dental vs alveolar friction)',
            'w / r      (lip rounding)',
        ],
        'llm_hint': (
            "English lip-reading confusions: b/p/m are identical on lips (both bilabials). "
            "f/v look the same. th/s/z are often confused. w/r look similar when rounded."
        ),
    },
    'zh': {
        'name': 'Mandarin Chinese',
        'native_name': '普通话',
        'config': 'configs/multilingual_zh.ini',
        'model_dir': 'benchmarks/multilingual/zh',
        'labels_type': 'char',
        'benchmark': 'LRW-1000 CER ~6%',
        'training_data': 'LRW-1000 (Mandarin word-level)',
        'lip_confusions': [
            'b / p      (bilabials)',
            'f / w      (labiodental vs bilabial)',
            'n / l      (nasal vs lateral — very common)',
            'd / t      (dental stops)',
            'zh / ch / sh (retroflex sibilants look similar)',
        ],
        'llm_hint': (
            "Mandarin lip-reading confusions: b/p bilabials look identical. "
            "n/l are extremely commonly confused (same tongue position, different nasality). "
            "zh/ch/sh retroflexes are hard to distinguish visually. "
            "Tones are invisible — infer from context."
        ),
    },
    'es': {
        'name': 'Spanish',
        'native_name': 'Espanol',
        'config': 'configs/multilingual_es.ini',
        'model_dir': 'benchmarks/multilingual/es',
        'labels_type': 'char',
        'benchmark': 'MV-LRS WER ~25%',
        'training_data': 'MV-LRS (multilingual)',
        'lip_confusions': [
            'b / v      (identical in most Spanish dialects)',
            'l / r / rr (alveolar laterals and trills)',
            'n / m      (nasals)',
        ],
        'llm_hint': (
            "Spanish lip-reading confusions: b and v are visually identical (both bilabials in Spanish). "
            "l/r are often confused. Silent h is invisible. "
            "Also check if the output could be from a neighboring language (Portuguese/French)."
        ),
    },
    'fr': {
        'name': 'French',
        'native_name': 'Francais',
        'config': 'configs/multilingual_fr.ini',
        'model_dir': 'benchmarks/multilingual/fr',
        'labels_type': 'char',
        'benchmark': 'MV-LRS WER ~28%',
        'training_data': 'MV-LRS (multilingual)',
        'lip_confusions': [
            'u / ou     (front rounded vs back rounded)',
            'b / p / m  (bilabials)',
            'f / v      (labiodentals)',
            'Silent endings (e/es/ent) are invisible',
        ],
        'llm_hint': (
            "French lip-reading confusions: silent word endings (e, es, ent, s) are invisible. "
            "u and ou are often swapped. b/p/m bilabials look identical. "
            "Liaison consonants may appear or disappear. Nasal vowels (an, en, on, in) are hard to distinguish."
        ),
    },
    'pt': {
        'name': 'Portuguese',
        'native_name': 'Portugues',
        'config': 'configs/multilingual_pt.ini',
        'model_dir': 'benchmarks/multilingual/pt',
        'labels_type': 'char',
        'benchmark': 'MV-LRS WER ~26%',
        'training_data': 'MV-LRS (multilingual)',
        'lip_confusions': [
            'b / v      (bilabials — same as Spanish)',
            'nasal vowels (ao, ae, em, im) look similar',
            'lh / nh    (palatal consonants)',
        ],
        'llm_hint': (
            "Portuguese lip-reading confusions: b/v bilabials look identical. "
            "Nasal vowels (ao, ae, em, im, um) are hard to distinguish visually. "
            "Silent final vowels (e, o in Brazilian) may disappear."
        ),
    },
    'ar': {
        'name': 'Arabic',
        'native_name': 'al-Arabiyya',
        'config': 'configs/multilingual_ar.ini',
        'model_dir': 'benchmarks/multilingual/ar',
        'labels_type': 'char',
        'benchmark': 'MV-LRS WER ~32%',
        'training_data': 'MV-LRS (multilingual)',
        'lip_confusions': [
            'b / m / f  (bilabials and labiodentals)',
            'Pharyngeal/uvular consonants (invisible in throat)',
            'Short vowels are often omitted in MSA',
        ],
        'llm_hint': (
            "Arabic lip-reading confusions: pharyngeal and uvular consonants (kh, gh, H, 3) "
            "are produced in the throat and nearly invisible on lips. "
            "b/m/f are visually similar. Short vowels (a, i, u) may be absent. "
            "Output may be in Modern Standard Arabic or a dialect — use context."
        ),
    },
}


def supported_langs():
    return list(LANGUAGES.keys())


def get_lang_config(lang: str) -> str:
    """Return the .ini config file path for a language code."""
    if lang not in LANGUAGES:
        raise ValueError(f"Unsupported language '{lang}'. Supported: {supported_langs()}")
    return LANGUAGES[lang]['config']


def get_lang_prompt(lang: str) -> str:
    """Return the language-specific hint for the LLM correction system prompt."""
    entry = LANGUAGES.get(lang, LANGUAGES['en'])
    name = entry['name']
    hint = entry['llm_hint']
    return (
        f"The lip-reading model is recognising {name}. "
        f"Output the corrected text in {name}. "
        f"{hint}"
    )


def model_is_downloaded(lang: str) -> bool:
    """Check if the model files for a language exist on disk."""
    if lang not in LANGUAGES:
        return False
    model_dir = os.path.join(_ROOT, LANGUAGES[lang]['model_dir'])
    pth = os.path.join(model_dir, 'model.pth')
    jsn = os.path.join(model_dir, 'model.json')
    return os.path.exists(pth) and os.path.exists(jsn)
