"""The built-in starter library: songs anyone can sing, free of rights.

Every melody here is in the public domain. The English lyrics are public
domain too (all from the 1800s). The two Portuguese songs use public-domain
melodies with new lyrics written for this project.

How a song is written down
--------------------------
Each lyric line is a string of "syllable:note:length" tokens.
  - length is in beats (quarter notes): 1 = quarter, 0.5 = eighth, 2 = half.
  - a syllable starting with "-" continues the previous word ("Twin -kle").
  - "~" holds the same syllable on a new note (a melisma).
  - a length ending in "*" makes a golden note (worth double points).
  - "_:-:2" is a 2-beat rest.
`chords` has one entry per bar; a bar may hold several chords ("F C").
`pickup` is how many beats the singing starts before the first full bar.
For a round, `round_entry_bars` says when the second voice (P2) starts the
same lines; the round is sung twice through.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class StarterSong:
    slug: str
    title: str
    artist: str
    language: str  # "en" | "pt"
    tempo: int  # quarter notes per minute
    beats_per_bar: int
    lines: tuple[str, ...]
    chords: tuple[str, ...]
    pickup: float = 0
    drums: bool = True
    round_entry_bars: int | None = None
    singers: dict[str, str] = field(default_factory=dict)
    intro_bars: int = 2


TWINKLE = StarterSong(
    slug="twinkle-twinkle",
    title="Twinkle, Twinkle, Little Star",
    artist="Jane Taylor (lyrics, 1806) / Traditional",
    language="en",
    tempo=96,
    beats_per_bar=4,
    drums=False,
    lines=(
        "Twin:C4:1 -kle:C4:1 twin:G4:1 -kle:G4:1 lit:A4:1 -tle:A4:1 star:G4:2",
        "How:F4:1 I:F4:1 won:E4:1 -der:E4:1 what:D4:1 you:D4:1 are:C4:2*",
        "Up:G4:1 a:G4:1 -bove:F4:1 the:F4:1 world:E4:1 so:E4:1 high:D4:2",
        "Like:G4:1 a:G4:1 dia:F4:1 -mond:F4:1 in:E4:1 the:E4:1 sky:D4:2",
        "Twin:C4:1 -kle:C4:1 twin:G4:1 -kle:G4:1 lit:A4:1 -tle:A4:1 star:G4:2",
        "How:F4:1 I:F4:1 won:E4:1 -der:E4:1 what:D4:1 you:D4:1 are:C4:2*",
    ),
    chords=("C", "F C", "F C", "G C", "C F", "C G", "C F", "C G", "C", "F C", "F C", "G C", "C"),
)

OH_SUSANNA = StarterSong(
    slug="oh-susanna",
    title="Oh! Susanna",
    artist="Stephen Foster (1848)",
    language="en",
    tempo=116,
    beats_per_bar=4,
    pickup=1,
    lines=(
        "I:C4:0.5 come:D4:0.5 from:E4:1 A:G4:1 -la:G4:1.5 -ba:A4:0.5 -ma:G4:1 with:E4:1 my:C4:1.5 ban:D4:0.5 -jo:E4:1 on:E4:1 my:D4:1 knee:C4:1 ~:D4:3",
        "I'm:C4:0.5 go:D4:0.5 -ing:E4:1 to:G4:1 Lou:G4:1.5 -i:A4:0.5 -si:G4:1 -an:E4:1 -a:C4:1.5 my:D4:0.5 true:E4:1 love:E4:1 for:D4:1 to:D4:1 see:C4:3",
        "It:C4:0.5 rained:D4:0.5 all:E4:1 night:G4:1 the:G4:1.5 day:A4:0.5 I:G4:1 left:E4:1 the:C4:1.5 wea:D4:0.5 -ther:E4:1 it:E4:1 was:D4:1 dry:C4:1 ~:D4:3",
        "The:C4:0.5 sun:D4:0.5 so:E4:1 hot:G4:1 I:G4:1.5 froze:A4:0.5 to:G4:1 death:E4:1 Su:C4:1.5 -san:D4:0.5 -na:E4:1 don't:E4:1 you:D4:1 cry:D4:1 ~:C4:3 _:-:1",
        "Oh:F4:2 Su:F4:1 -san:A4:1 -na:A4:2 oh:G4:1 don't:G4:1 you:E4:1 cry:C4:1 for:D4:1 me:D4:4*",
        "For:C4:0.5 I:D4:0.5 come:E4:1 from:G4:1 A:G4:1.5 -la:A4:0.5 -ba:G4:1 -ma:E4:1 with:C4:1.5 my:D4:0.5 ban:E4:1 -jo:E4:1 on:D4:1 my:D4:1 knee:C4:4*",
    ),
    chords=(
        "C", "C", "C", "G", "C", "C", "G", "C",
        "C", "C", "C", "G", "C", "C", "G", "C",
        "F", "C", "C G", "G", "C", "C", "G", "C", "C",
    ),
)

JINGLE_BELLS = StarterSong(
    slug="jingle-bells",
    title="Jingle Bells (chorus)",
    artist="James Lord Pierpont (1857)",
    language="en",
    tempo=120,
    beats_per_bar=4,
    lines=(
        "Jin:E4:1 -gle:E4:1 bells:E4:2 jin:E4:1 -gle:E4:1 bells:E4:2",
        "Jin:E4:1 -gle:G4:1 all:C4:1.5 the:D4:0.5 way:E4:4*",
        "Oh:F4:1 what:F4:1 fun:F4:1.5 it:F4:0.5 is:F4:1 to:E4:1 ride:E4:1 in:E4:0.5 a:E4:0.5",
        "one:E4:1 -horse:D4:1 o:D4:1 -pen:E4:1 sleigh:D4:2 hey:G4:2",
        "Jin:E4:1 -gle:E4:1 bells:E4:2 jin:E4:1 -gle:E4:1 bells:E4:2",
        "Jin:E4:1 -gle:G4:1 all:C4:1.5 the:D4:0.5 way:E4:4*",
        "Oh:F4:1 what:F4:1 fun:F4:1.5 it:F4:0.5 is:F4:1 to:E4:1 ride:E4:1 in:E4:0.5 a:E4:0.5",
        "one:G4:1 -horse:G4:1 o:F4:1 -pen:D4:1 sleigh:C4:4*",
    ),
    chords=("C", "C", "C", "C", "F", "C", "D7", "G7", "C", "C", "C", "C", "F", "C", "G7", "C", "C"),
)

ROW_YOUR_BOAT = StarterSong(
    slug="row-your-boat",
    title="Row, Row, Row Your Boat (round for two)",
    artist="Traditional (1852)",
    language="en",
    tempo=100,
    beats_per_bar=3,  # 6/8 feels like two dotted quarters; we count in quarter notes
    round_entry_bars=2,
    singers={"P1": "Voice 1", "P2": "Voice 2"},
    lines=(
        "Row:C4:1.5 row:C4:1.5 row:C4:1 your:D4:0.5 boat:E4:1.5",
        "Gent:E4:1 -ly:D4:0.5 down:E4:1 the:F4:0.5 stream:G4:3",
        "Mer:C5:0.5 -ri:C5:0.5 -ly:C5:0.5 mer:G4:0.5 -ri:G4:0.5 -ly:G4:0.5 mer:E4:0.5 -ri:E4:0.5 -ly:E4:0.5 mer:C4:0.5 -ri:C4:0.5 -ly:C4:0.5",
        "Life:G4:1 is:F4:0.5 but:E4:1 a:D4:0.5 dream:C4:3*",
    ),
    chords=("C",) * 20,
)

DORME_JOAO = StarterSong(
    slug="dorme-joao",
    title="Dorme, João? (cânone a duas vozes)",
    artist="Melodia tradicional (Frère Jacques) / letra: Mic Check",
    language="pt",
    tempo=104,
    beats_per_bar=4,
    round_entry_bars=2,
    singers={"P1": "Voz 1", "P2": "Voz 2"},
    lines=(
        "Dor:C4:1 -me:D4:1 Jo:E4:1 -ão:C4:1 dor:C4:1 -me:D4:1 Jo:E4:1 -ão:C4:1",
        "Le:E4:1 -van:F4:1 -ta:G4:2 le:E4:1 -van:F4:1 -ta:G4:2",
        "To:G4:0.5 -cam:A4:0.5 os:G4:0.5 si:F4:0.5 -nos:E4:1 já:C4:1 to:G4:0.5 -cam:A4:0.5 os:G4:0.5 si:F4:0.5 -nos:E4:1 já:C4:1",
        "Dim:C4:1 dem:G3:1 dom:C4:2 dim:C4:1 dem:G3:1 dom:C4:2*",
    ),
    chords=("C",) * 20,
)

CANTA_CANTA = StarterSong(
    slug="canta-canta",
    title="Canta, Canta",
    artist="Ludwig van Beethoven (Ode à Alegria, 1824) / letra: Mic Check",
    language="pt",
    tempo=112,
    beats_per_bar=4,
    lines=(
        "Can:E4:1 -ta:E4:1 can:F4:1 -ta:G4:1 meu:G4:1 a:F4:1 -mi:E4:1 -go:D4:1",
        "can:C4:1 -ta:C4:1 com:D4:1 o:E4:1 co:E4:1.5 -ra:D4:0.5 -ção:D4:2",
        "Dan:E4:1 -ça:E4:1 dan:F4:1 -ça:G4:1 to:G4:1 -do:F4:1 mun:E4:1 -do:D4:1",
        "dan:C4:1 -ça:C4:1 sem:D4:1 nin:E4:1 -guém:D4:1.5 pa:C4:0.5 -rar:C4:2*",
        "Quan:D4:1 -do:D4:1 a:E4:1 gen:C4:1 -te:D4:1 can:E4:0.5 -ta:F4:0.5 jun:E4:1 -to:C4:1",
        "o:D4:1 mun:E4:0.5 -do:F4:0.5 fi:E4:1 -ca:D4:1 mais:C4:1 fe:D4:1 -liz:G3:2",
        "Can:E4:1 -ta:E4:1 can:F4:1 -ta:G4:1 meu:G4:1 a:F4:1 -mi:E4:1 -go:D4:1",
        "can:C4:1 -ta:C4:1 com:D4:1 o:E4:1 co:D4:1.5 -ra:C4:0.5 -ção:C4:2*",
    ),
    chords=("C", "G", "C", "G", "C", "G", "C", "G C", "G", "G C", "G", "C G", "C", "G", "C", "G C", "C"),
)

STARTER_SONGS: tuple[StarterSong, ...] = (TWINKLE, OH_SUSANNA, JINGLE_BELLS, ROW_YOUR_BOAT, DORME_JOAO, CANTA_CANTA)
