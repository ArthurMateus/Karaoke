# Credits and licences

> **DRAFT, to be reviewed by a lawyer.** Not legal advice. Shown in the app as "Credits & licences" (one page for both languages; the licence texts stay in English as written by their authors). Keep it in step with `docs/legal/LEGAL-REVIEW-*.md`. When the app is built for production, also serve the full licence files (see "How to keep this complete" at the end).

Karaoke Party is made with free and open-source software, fonts and models. Thank you to everyone who made them.

## Songs

The starter songs use **public-domain** melodies and words:

- *Twinkle, Twinkle, Little Star*: words by Jane Taylor (1806), traditional French melody (1761).
- *Oh! Susanna*: Stephen Foster (1848).
- *Jingle Bells (chorus)*: James Lord Pierpont (1857).
- *Row, Row, Row Your Boat*: traditional (1852).
- *Dorme, João?*: traditional melody (*Frère Jacques*), Portuguese words by Karaoke Party.
- *Canta, Canta*: melody from Ludwig van Beethoven's *Ode to Joy* (1824), Portuguese words by Karaoke Party.

Arrangements by Karaoke Party, played with the **FluidR3 GM** soundfont by Frank Wen and contributors (MIT licence).

Songs you upload belong to their owners. Lyrics found with **[LRCLIB](https://lrclib.net)** (a free community lyrics database) belong to their authors and publishers.

## Fonts

- **Unbounded**: Copyright 2022 The Unbounded Project Authors (github.com/googlefonts/unbounded). SIL Open Font License 1.1.
- **Figtree**: Copyright 2022 The Figtree Project Authors (github.com/erikdkennedy/figtree). SIL Open Font License 1.1.

Packaged by Fontsource. Licence: https://openfontlicense.org (full text: [link to served OFL file]).

## Icons and effects

- **Lucide** icons: Copyright (c) 2026 Lucide Icons and Contributors. ISC licence. Some icons are derived from **Feather**: Copyright (c) 2013-present Cole Bemis, MIT licence. Both texts are below.
- **canvas-confetti**: Copyright (c) 2020, Kiril Vatev. ISC licence.
- Cover art, lane drawings and the logo are made by Karaoke Party.

## In your browser

| Software | Licence |
|---|---|
| React, React DOM | MIT, Meta Platforms, Inc. and affiliates |
| React Router | MIT, Remix Software Inc. / Shopify |
| TanStack Query | MIT, Tanner Linsley |
| i18next, react-i18next, i18next-browser-languagedetector | MIT, i18next authors |
| node-qrcode | MIT, Ryan Day |
| LiveKit client SDK, LiveKit protocol | Apache-2.0, LiveKit, Inc. |
| RxJS | Apache-2.0, Google, Inc., Netflix, Inc., Microsoft Corp. and contributors |
| Protobuf-ES | Apache-2.0 and BSD-3-Clause, Buf Technologies, Inc. |
| webrtc-adapter | BSD-3-Clause, The WebRTC project authors |
| sdp, sdp-transform, events, loglevel, jose, typed-emitter, machina, pngjs, dijkstrajs | MIT, their authors |
| tslib | 0BSD, Microsoft Corp. |

`[Check the copyright holders against each package's LICENSE file when generating the final page.]`

## On our servers

| Software | Licence |
|---|---|
| Python, FastAPI, Starlette, Uvicorn, SQLAlchemy, Alembic, Pydantic, RQ, NumPy, boto3 and others | PSF, MIT, BSD, Apache-2.0 |
| psycopg | LGPL-3.0 |
| PyTorch, torchaudio | BSD-3-Clause |
| WhisperX (Max Bain) | BSD-2-Clause |
| faster-whisper, CTranslate2 | MIT |
| Demucs (Meta / Alexandre Défossez) | MIT |
| torchcrepe (Max Morrison) | MIT |
| pyannote.audio (CNRS) | MIT |
| Hugging Face Transformers, Hub | Apache-2.0 |
| FFmpeg | GPL-2.0-or-later |
| FluidSynth | LGPL-2.1-or-later |
| PostgreSQL | PostgreSQL Licence |
| Redis `[or Valkey]` | RSALv2/SSPLv1 `[Valkey: BSD-3-Clause]` |
| SeaweedFS, Caddy, LiveKit server | Apache-2.0 |

## AI models

Used on our servers to turn uploaded songs into karaoke charts:

- **HTDemucs** (voice and music separation): Alexandre Défossez / Meta AI, MIT.
- **Whisper** (lyrics recognition): OpenAI, MIT; CTranslate2 versions by Systran, MIT.
- **wav2vec 2.0 base, 960 h** (word timing, English): Meta AI fairseq via torchaudio, MIT. Trained on LibriSpeech (CC BY 4.0).
- **wav2vec2-large-xlsr-53-portuguese** (word timing, Portuguese): Jonatas Grosman, Apache-2.0. Trained on Mozilla Common Voice (CC0). Grosman, J. (2021). *Fine-tuned XLSR-53 large model for speech recognition in Portuguese*.
- **pyannote segmentation** (finding where someone is singing): Hervé Bredin and CNRS, MIT.
- **CREPE** (melody), via torchcrepe: Jong Wook Kim et al., MIT.

## Licence texts

### ISC licence (Lucide; canvas-confetti with its own copyright line)

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

(canvas-confetti: the same text with "Copyright (c) 2020, Kiril Vatev".)

### MIT licence (Feather-derived Lucide icons; other MIT software with its own copyright line)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### SIL Open Font License 1.1, Apache License 2.0, BSD licences

Too long to repeat here: [links to the served full texts].

---

## How to keep this complete (for the developer, not shown in the app)

- The page must list every package in the browser bundle (`npm ls --omit=dev`) with its licence notice. When dependencies change, regenerate the list from `node_modules/*/LICENSE` (a small script, no new dependency needed) into a served `licenses.txt`, and link it from this page.
- Serve copies of `node_modules/@fontsource-variable/unbounded/LICENSE` and `.../figtree/LICENSE` (the OFL text) next to the fonts.
- Lucide: keep the full LICENSE (including the list of Feather-derived icons) in `licenses.txt`.
