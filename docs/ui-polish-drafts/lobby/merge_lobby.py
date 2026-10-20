import os, re, shutil
sp = os.path.dirname(os.path.abspath(__file__))
fe = 'C:/projects/Webt Stuff/karaoke-party/frontend/src/'

for name, dest in [('ReadyPanel.tsx', 'room/'), ('SongPicker.tsx', 'room/'), ('SpotlightLobby.tsx', 'room/'),
                   ('LobbyPage.tsx', 'pages/'), ('lobby.css', 'styles/')]:
    shutil.copyfile(os.path.join(sp, name), fe + dest + name)


def rd(p): return open(fe + p, encoding='utf-8').read()
def wr(p, s): open(fe + p, 'w', encoding='utf-8', newline='\n').write(s)


def drop_rules(path, selectors):
    s = rd(path)
    for sel in selectors:
        pat = re.compile(r'(^|\n)' + re.escape(sel) + r' \{[^{}]*\}\n')
        s, n = pat.subn(r'\1', s)
        print(path, repr(sel), n)
    wr(path, s)


# These moved to lobby.css.
drop_rules('styles/sing.css', ['.meter', '.meter-bar', '.calibrating', 'details.picker > summary', 'details.picker[open] > summary',
                               '.pick-list', '.pick,\n.chosen-song', '.pick.selected,\n.chosen-song', '.pick-main'])
drop_rules('styles/spotlight.css', ['.queue', '.queue-entry', '.queue-entry.next', '.queue-place', '.queue-entry .pick-main'])

s = rd('styles/base.css')
if '.hide-on-phone' not in s:
    s = s.replace("@media (prefers-reduced-motion: reduce) {\n  * {\n    transition: none !important;\n  }\n}\n", """@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
  }
}

/* Shown in one place on phones (e.g. the bottom action bar) and another on bigger screens. */
.show-on-phone {
  display: none;
}
@media (max-width: 760px) {
  .hide-on-phone {
    display: none !important;
  }
  .show-on-phone {
    display: revert;
  }
}
""", 1)
    wr('styles/base.css', s)
print('merged')
