"""Read-only source capture. Does not install or execute downloaded project code."""
import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

repository = 'TencentCloud/TencentDB-Agent-Memory'
destination = Path('output/dev-evidence/memory-source')
destination.mkdir(parents=True, exist_ok=True)

def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 workbench-source-review'})
    return urllib.request.urlopen(request, timeout=30).read()

revision_path = destination / 'revision.json'
if revision_path.exists():
    commit = json.loads(revision_path.read_text(encoding='utf-8'))['commit']
else:
    html = fetch('https://github.com/' + repository).decode()
    commit = re.search(r'"currentOid"\s*:\s*"([0-9a-f]{40})"', html).group(1)
assert re.fullmatch('[0-9a-f]{40}', commit)
sources = []
for name in ['README_CN.md', 'INSTALL_CN.md', 'LICENSE', 'deploy/global-images/.env.example', 'deploy/global-images/start-all.sh']:
    url = f'https://raw.githubusercontent.com/{repository}/{commit}/{name}'
    content = fetch(url)
    file = name.replace('/', '__')
    (destination / file).write_bytes(content)
    sources.append({'path': name, 'file': file, 'url': url, 'sha256': hashlib.sha256(content).hexdigest()})
manifest = {'repository': repository, 'commit': commit, 'capturedAt': datetime.now(timezone.utc).isoformat(), 'executedCode': False, 'sources': sources}
(destination / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'commit': commit, 'capturedFiles': len(sources), 'executedCode': False}))
