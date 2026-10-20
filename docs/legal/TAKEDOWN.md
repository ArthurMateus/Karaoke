# Reports and takedowns (private beta)

What the owner does when a copyright or content report arrives at the contact email (beta Terms §9; Lei 9.610/1998,
Marco Civil arts. 19 and 21). Not legal advice.

1. **Read it within 2 working days.** Reply that you got it.
2. **Is it specific?** It should say which song (title, whose library or room), who owns the rights or why it's
   unlawful, and how to reach the sender. If it's vague, ask for the missing details.
3. **Find the song:**
   `docker compose exec api python -m app.scripts.delete_song --find "part of the title"`
   (prints id, title, artist and the uploader's email).
4. **Take it down** (dry run first, then for real):
   `docker compose exec api python -m app.scripts.delete_song <song id>` then add `--yes`.
   This removes the song, its files and the replays that mix its music. Intimate images shown without consent
   (Marco Civil art. 21): remove at once, the same way, or with `delete_user` for the person's recordings.
5. **Tell the uploader** what was removed and why; they may reply (if they show they have the rights, you may let
   them upload it again).
6. **Keep a record** in a private place (not in this public repo): the report, the date, what you removed, who you
   told. Someone reported more than once for real infringement: close the account (`delete_user`).
