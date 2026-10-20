You're finishing the UI polish step of my karaoke app **Encore** in this folder (C:\Users\ArthurFerreiradaSilv\Desktop\Karaoke; GitHub ArthurMateus/Karaoke, branch main). Read HANDOFF.md first, especially "UI polish step" and the part "Paused here", then docs/ui-polish-plan.md.

Where we are: Phases 1-6 are built, committed and pushed, with before/after screenshots. Guests now see "Party Pass until HH:MM" (approved API change). Not done yet: QA of Phases 3-6 and the final legal review.

Do this, in order:
1. Make sure Docker Desktop is running and `docker compose up -d` works (if port 8080 is busy, another project like SignalDesk is running: ask me before stopping it).
2. Run the qa-tester agent on Phases 3-6 and fix what it reports (all blockers and majors, the minors that make sense; list the rest for me).
3. Run the legal-reviewer agent for the final review, including whether the name "Encore" is safe to use (trademark, domain). Act on its "must fix" items and list the rest for me.
4. Delete the helper scratch folders docs/ui-polish-work/ and design/shots/qa/work/, finish the HANDOFF.md section, and show me a short summary.

Rules (same as before):
- Don't change game rules, scoring, audio timing or the API without asking me.
- Keep English and Portuguese in step.
- Run the typecheck, lint and tests before every commit. Small, well-described commits, pushed to main.
- The API reloads on every backend save, which resets live rooms: don't edit the backend while a QA run is testing rooms.
- Credits are limited: prefer one agent at a time, and don't redo work that's already done.

I'm not an expert, so explain steps plainly.
