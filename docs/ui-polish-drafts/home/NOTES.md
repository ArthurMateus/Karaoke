# Home page draft (Phase 2)

## What's here
- `HomePage.tsx`: replaces `frontend/src/pages/HomePage.tsx`.
  - Hero: eyebrow, headline, tagline. Below them: "Create a room" (or the sign-in button plus `home.signInToHost` for guests and signed-out visitors), then "Join with a code" with the code field and the Join button in one row. On the right sits `HeroLane`. Side by side from 960 px; on phones the text and actions come first, so the main action shows without scrolling.
  - Kept behaviour: create room → `/room/CODE`; `normalizeCode` → `/join/CODE`, or `home.invalidCode` (now `role="alert"`, linked to the input with `aria-describedby` / `aria-invalid`); the solo link; song of the day from `useDaily()`.
  - Tiles: Sing Together, Spotlight (Premium badge), Solo (link to /solo), Song of the day (cover, title, artist, a countdown to `next_song_at`, "#N today · score points" when `my_attempt.rank` exists, otherwise `home.dailyText`; link to /daily). While loading, a skeleton the same size as the content stands in. The countdown is its own component, so only that line re-renders every second.
  - How it works: an `<ol>` with 3 steps, each with a small decorative inline SVG built from the `mini-lane-*` classes.
- `home.css`: replaces `frontend/src/styles/home.css`. Keeps `.lane-art`, `.lane-grid`, `.lane-note(.hit)`, `.lane-trace`, `.lane-now`, `.lane-dot` (`LaneArt` in Brand.tsx still uses them). Adds the `.hero-art`, `.hero-lane`, `.hero-scroll`, `.hero-chip`, `.hero-rating`, `.hero-score` and `.hero-singers` classes that HeroLane needs. The scroll animation and the rating "pop" exist only under `prefers-reduced-motion: no-preference`, and they animate only transform and opacity.
- `i18n.json`: 12 new keys, in English and pt-BR.

## Merging
- Add the keys to both `en.json` and `pt-BR.json`. i18n.test.ts checks that both files have the same keys.
- Reused keys: `home.headline/createRoom/creating/signInToHost/codePlaceholder/join/invalidCode/soloTitle/soloText/solo/dailyText/daily`, `app.tagline`, `nav.signIn`, `modes.sing_together`, `modes.spotlight`, `plan.names.premium`, `daily.title/noSong/yourRank`, `game.sing.points`.
- These keys are no longer used on the home page: `home.hostTitle`, `home.hostText`, `home.joinTitle`, `home.codeLabel`. The input's label is now the visible "Join with a code". Delete them only if nothing else uses them.
- After this change nothing imports `LaneArt` (Brand.tsx), but I kept its CSS for the Phase 6 auth card.
- `home.dailyNext` is shorter than `daily.nextIn` (it leaves out "midnight UTC") so it fits the tile.
- No plural keys were needed: no counts appear.

## Not done / assumptions
- Typecheck: I ran it in a scratch copy, using the host's node_modules through a junction. It found no errors in HomePage.tsx except "cannot find lucide-react": that package isn't installed on the host (only in Docker), and the existing ui files fail the same way. Please typecheck and lint in Docker. The icons I used: ArrowRight, CalendarDays, LogIn, Mic, Plus, Sparkles, Timer, Trophy, Users.
- Not seen in a browser: no screenshots at 360, 414 or 1280 px.
- When the countdown reaches 0 it stays at "0:00" until `useDaily` refetches. It doesn't trigger a refetch.
- The Spotlight badge says only "Premium", but a Party Pass unlocks Spotlight too (`plan.spotlightNo`). Have the legal or copy check confirm this is fine.
- If `useDaily` fails, the tile shows `home.dailyText` and the link.
