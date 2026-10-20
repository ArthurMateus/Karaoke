# usage: python i18n_set.py changes.json   where changes.json = {"a.b.c": ["english", "portugues"], ...}
import json, sys
base = 'C:/projects/Webt Stuff/karaoke-party/frontend/src/i18n/'
changes = json.load(open(sys.argv[1], encoding='utf-8'))
for idx, name in enumerate(['en.json', 'pt-BR.json']):
    path = base + name
    data = json.load(open(path, encoding='utf-8'))
    for key, texts in changes.items():
        node = data
        parts = key.split('.')
        for p in parts[:-1]:
            node = node.setdefault(p, {})
        if texts is None:
            node.pop(parts[-1], None)
        else:
            node[parts[-1]] = texts[idx]
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print('ok', len(changes))
