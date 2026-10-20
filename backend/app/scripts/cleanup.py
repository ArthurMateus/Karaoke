"""Delete old personal data, as the Privacy page promises (run it once a week).

  - recordings and group replays of songs sung more than --days days ago (scores stay);
  - guests created more than --guest-days days ago, with their recordings and names in results;
  - expired sign-in links and sessions.

It only shows what it would delete unless you add --yes:

  docker compose exec api python -m app.scripts.cleanup          # dry run
  docker compose exec api python -m app.scripts.cleanup --yes    # delete
"""

import argparse
from datetime import timedelta

from app.db import get_sessionmaker, utcnow
from app.services import erasure


def run(days: int = 30, guest_days: int = 30, apply: bool = False) -> erasure.Report:
    now = utcnow()
    report = erasure.Report()
    with get_sessionmaker()() as db:
        erasure.delete_old_guests(db, now - timedelta(days=guest_days), report, apply)
        db.flush()
        erasure.delete_old_recordings(db, now - timedelta(days=days), report, apply)
        erasure.delete_expired_sign_ins(db, now, report, apply)
        if apply:
            db.commit()
        else:
            db.rollback()
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--days", type=int, default=30, help="keep recordings and replays this many days (30)")
    parser.add_argument("--guest-days", type=int, default=30, help="keep guests this many days (30)")
    parser.add_argument("--yes", action="store_true", help="really delete (without it: only show what would go)")
    args = parser.parse_args()
    report = run(args.days, args.guest_days, apply=args.yes)
    print("Deleted:" if args.yes else "Would delete (dry run, add --yes to delete):")
    print("\n".join(report.lines()))


if __name__ == "__main__":
    main()
