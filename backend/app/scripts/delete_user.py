"""Delete an account (or a guest) and all its data, for a deletion request (LGPD art. 18).

Removes the user, their songs and all their files, the performances they hosted, their
recordings and the group replays with their voice, daily attempts, grants, sessions and
sign-in links. In other people's results their name becomes "Deleted player".

It only shows what it would delete unless you add --yes:

  docker compose exec api python -m app.scripts.delete_user friend@example.com          # dry run
  docker compose exec api python -m app.scripts.delete_user friend@example.com --yes    # delete

A guest has no email: pass their user id instead (find it in the database by name).
"""

import argparse
import sys

from app.db import get_sessionmaker
from app.services import erasure


def run(email_or_id: str, apply: bool = False) -> erasure.Report | None:
    """None if there's no such user."""
    with get_sessionmaker()() as db:
        user = erasure.find_user(db, email_or_id)
        if user is None:
            return None
        report = erasure.Report()
        erasure.erase_user(db, user, report, apply)
        if apply:
            db.commit()
        else:
            db.rollback()
        return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("user", help="the account's email, or a user id (guests)")
    parser.add_argument("--yes", action="store_true", help="really delete (without it: only show what would go)")
    args = parser.parse_args()
    report = run(args.user, apply=args.yes)
    if report is None:
        print(f"No user {args.user!r} found.")
        sys.exit(1)
    print("Deleted:" if args.yes else "Would delete (dry run, add --yes to delete):")
    print("\n".join(report.lines()))


if __name__ == "__main__":
    main()
