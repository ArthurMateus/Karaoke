# Footer pages shown in the app

Copies of the legal drafts in `docs/legal/drafts/` (written by the legal reviewer agent), shown at
`/terms`, `/privacy` and `/credits`. When a draft in `docs/legal/drafts/` changes, copy it here again.
They stay marked as drafts until a lawyer has reviewed them.

- During the private beta, `/terms` shows the short `beta-terms.*.md`. The long launch draft stays in
  `docs/legal/drafts/terms.*.md` (it still has placeholders, so it must not be shown as it is).
- `privacy.*.md` is the beta version of the Privacy Policy.
- `credits.md` links the full licence texts in `frontend/public/licenses/` and drops the developer notes
  at the end of its draft.

Who runs the app is filled in when the page is shown (`src/lib/legalFacts.ts`), from the server's
settings (`GET /api/config`, see `.env.example`): `{{operator}}`, `{{city}}`, `{{contact}}`,
`{{hosting}}`, `{{email_provider}}`, `{{beta_end}}`. A value that isn't set shows "not set yet".
Never write `[BRACKETED]` placeholders in these files: visitors would see them.

When the terms change in a way people should accept again, raise `TERMS_VERSION` in
`backend/app/services/auth.py` and the version line at the top of both files.
