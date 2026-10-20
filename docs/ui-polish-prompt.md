You're continuing my karaoke party app in this folder. Read HANDOFF.md, README.md and docs/ui-polish-plan.md first.

The task is the UI polish step in docs/ui-polish-plan.md: I like the current "Pitch Lane" style, but every screen is still too simple. Make the whole app look like a finished, fun product while keeping that style. Follow the plan's phases, quality bars and "Done means".

This project has two subagents in .claude/agents/. Use them through the Agent tool:
- qa-tester: after every phase, to run all tests and walk the flows in the browser with the robot singer at phone and desktop sizes. Fix what it reports before moving on.
- legal-reviewer: at the start (to check any new dependency, font or icon set, and to draft the Terms, Privacy and Credits pages for the footer) and again at the end. Act on its "must fix" items and list the rest for me.

Rules:
- Don't change game rules, scoring, audio timing or the API. If a screen needs something the API doesn't give, ask me.
- Take before/after screenshots of every screen you touch (390 px and 1280 px) as described in the plan.
- After Phase 2 (design system + home + lobby), stop, show me the screenshots and wait for my go-ahead before the other phases.
- Keep English and Portuguese texts in step, run the typecheck, lint and tests before every commit, and make small, well-described commits.

I'm not an expert, so explain steps plainly.
