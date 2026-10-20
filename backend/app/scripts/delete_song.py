"""Take down an uploaded song (a copyright or content report): see docs/legal/TAKEDOWN.md.

Deletes the song, its files (original, separated voice and instrumental) and the replays
that mix its music. Results and scores stay.

  docker compose exec api python -m app.scripts.delete_song --find "part of the title"
  docker compose exec api python -m app.scripts.delete_song <song id>          # dry run
  docker compose exec api python -m app.scripts.delete_song <song id> --yes    # delete
"""

import argparse
import sys
import uuid

from sqlalchemy import select

from app.db import get_sessionmaker
from app.models import Song, User
from app.services import erasure


def find(text: str) -> list[tuple[str, str, str, str]]:
    """(id, title, artist, owner email) of songs whose title or artist contains the text."""
    with get_sessionmaker()() as db:
        rows = db.execute(
            select(Song.id, Song.title, Song.artist, User.email)
            .outerjoin(User, User.id == Song.owner_id)
            .where(Song.title.ilike(f"%{text}%") | Song.artist.ilike(f"%{text}%"))
            .order_by(Song.title)
        )
        return [(str(i), t, a, e or "(starter song)") for i, t, a, e in rows]


def run(song_id: str, apply: bool = False) -> erasure.Report | None:
    with get_sessionmaker()() as db:
        try:
            song = db.get(Song, uuid.UUID(song_id))
        except ValueError:
            song = None
        if song is None:
            return None
        report = erasure.Report()
        erasure.erase_song(db, song, report, apply)
        if apply:
            db.commit()
        else:
            db.rollback()
        return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("song", nargs="?", help="the song id")
    parser.add_argument("--find", metavar="TEXT", help="list songs whose title or artist contains TEXT")
    parser.add_argument("--yes", action="store_true", help="really delete (without it: only show what would go)")
    args = parser.parse_args()
    if args.find:
        for row in find(args.find) or [("no songs found", "", "", "")]:
            print("  ".join(row))
        return
    if not args.song:
        parser.error("give a song id, or --find TEXT")
    report = run(args.song, apply=args.yes)
    if report is None:
        print(f"No song {args.song!r} found.")
        sys.exit(1)
    print("Deleted:" if args.yes else "Would delete (dry run, add --yes to delete):")
    print("\n".join(report.lines()))


if __name__ == "__main__":
    main()
