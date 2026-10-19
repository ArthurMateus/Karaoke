"""Songs store a short language code ("en"); UltraStar charts use English names ("English")."""

NAMES = {
    "en": "English",
    "pt": "Portuguese",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "ja": "Japanese",
    "ko": "Korean",
    "nl": "Dutch",
    "pl": "Polish",
    "ru": "Russian",
}
CODES = {name.lower(): code for code, name in NAMES.items()} | {"português": "pt", "portugues": "pt", "español": "es"}


def language_name(code: str) -> str:
    return NAMES.get(code, code)


def language_code(name: str) -> str:
    """'English' -> 'en'. Unknown names give ''."""
    name = name.strip().lower()
    if name in NAMES:
        return name
    return CODES.get(name, "")
