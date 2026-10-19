"""Put the starter library in the database and storage.

Runs automatically when the worker starts (only missing songs are made).
To rebuild every song after changing app/starter/songs.py:

    docker compose exec worker python -m app.starter.seed --force
"""

import argparse
import logging
import subprocess
import tempfile
from pathlib import Path

from sqlalchemy import select

from app.charts import ultrastar
from app.charts.model import validate
from app.db import get_sessionmaker
from app.models import Song
from app.services import storage
from app.starter.build import build_chart, build_midi
from app.starter.songs import STARTER_SONGS, StarterSong

log = logging.getLogger("starter")

# From the Debian package fluid-soundfont-gm (FluidR3 GM, MIT licence).
SOUNDFONT = "/usr/share/sounds/sf2/FluidR3_GM.sf2"


def render(song: StarterSong, folder: Path) -> tuple[Path, float]:
    """MIDI -> WAV with FluidSynth -> loudness-normalised AAC (.m4a)."""
    midi_path, wav_path, m4a_path = folder / "song.mid", folder / "song.wav", folder / "song.m4a"
    build_midi(song).save(midi_path)
    subprocess.run(
        ["fluidsynth", "-ni", "-q", "-g", "0.8", "-r", "44100", "-F", str(wav_path), SOUNDFONT, str(midi_path)],
        check=True,
        timeout=300,
    )
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(wav_path), "-af", "loudnorm=I=-16:TP=-1.5", "-ar", "44100",
         "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(m4a_path)],
        check=True,
        timeout=300,
    )
    duration = float(
        subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(m4a_path)],
            capture_output=True, text=True, check=True,
        ).stdout
    )
    return m4a_path, duration


def seed(force: bool = False) -> int:
    storage.ensure_bucket()
    made = 0
    with get_sessionmaker()() as db:
        for starter in STARTER_SONGS:
            song = db.scalar(select(Song).where(Song.starter_slug == starter.slug))
            if song is not None and not force:
                continue
            chart = build_chart(starter)
            validate(chart)
            if song is None:
                song = Song(source="starter", starter_slug=starter.slug, title=starter.title, artist=starter.artist)
                db.add(song)
                db.flush()
            log.info("rendering %s", starter.slug)
            with tempfile.TemporaryDirectory() as tmp:
                m4a, duration = render(starter, Path(tmp))
                key = f"songs/{song.id}/instrumental.m4a"
                storage.upload_file(key, m4a, "audio/mp4")
            song.title, song.artist, song.language = starter.title, starter.artist, starter.language
            song.chart_txt = ultrastar.write(chart)
            song.is_duet = chart.is_duet
            song.duration_seconds = duration
            song.instrumental_key = key
            song.status, song.progress_step, song.progress_pct, song.error_code = "ready", "done", 100, None
            db.commit()
            made += 1
    return made


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="rebuild songs that already exist")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    made = seed(force=args.force)
    log.info("starter library: %d song(s) built, %d total", made, len(STARTER_SONGS))


if __name__ == "__main__":
    main()
