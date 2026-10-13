"""Download fixed revision as inert text; no installation or project execution."""
import concurrent.futures
import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

base = Path('output/dev-evidence')
initial = json.loads((base / 'memory-source/manifest.json').read_text(encoding='utf-8'))
commit = initial['commit']
assert re.fullmatch(r'[0-9a-f]{40}', commit)
dest = base / 'memory-deployment-review'
dest.mkdir(exist_ok=True)
records, failures = {}, {}
for entry in initial['sources']:
    data = (base / 'memory-source' / entry['file']).read_bytes()
    assert hashlib.sha256(data).hexdigest() == entry['sha256']
    if entry['path'].startswith('deploy/global-images/'):
        name = entry['path'].split('/')[-1]
        (dest / (name + '.source.txt')).write_bytes(data)
        records[name] = dict(entry, captureFile=name + '.source.txt', origin='verified-original-capture')

def capture(name):
    assert re.fullmatch(r'[A-Za-z0-9_-]+\.sh', name)
    url = f'https://raw.githubusercontent.com/{initial["repository"]}/{commit}/deploy/global-images/{name}'
    request = urllib.request.Request(url, headers={'User-Agent': 'workbench-fixed-source-review'})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = response.read(1024 * 1024 + 1)
        assert len(data) <= 1024 * 1024
        text = data.decode('utf-8')
        (dest / (name + '.source.txt')).write_bytes(data)
        return name, dict(path='deploy/global-images/' + name, captureFile=name + '.source.txt', url=url, sha256=hashlib.sha256(data).hexdigest(), bytes=len(data), origin='fixed-revision-download'), text
    except Exception as error:
        return name, None, type(error).__name__ + ': ' + str(error)[:220]

pending = {'_lib.sh', 'start-memory-core.sh', 'start-memory-hub.sh', 'start-proxy.sh', 'verify.sh', 'stop-all.sh'}
attempted = set(records)
while pending:
    names = sorted(pending - attempted)
    assert len(attempted) + len(names) <= 24, 'Bound recursive text-reference capture'
    if not names:
        break
    attempted.update(names)
    pending = set()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for name, entry, value in pool.map(capture, names):
            if entry is None:
                failures[name] = value
                print(json.dumps({'file': name, 'status': 'download-failed', 'error': value}), flush=True)
                continue
            records[name] = entry
            pending.update(re.findall(r'\b[A-Za-z0-9_-]+\.sh\b', value))
            print(json.dumps({'file': name, 'status': 'captured', 'bytes': entry['bytes']}), flush=True)
references = []
for name, entry in records.items():
    text = (dest / entry['captureFile']).read_text(encoding='utf-8')
    for number, line in enumerate(text.splitlines(), 1):
        if re.search(r'\b(source|docker|curl|eval|sudo|chmod|chown|rm)\b|\.sh\b|--(privileged|network|cap-add)|(?<!\w)-[pv]\s', line):
            references.append({'file': name, 'line': number, 'text': line[:500]})
manifest = dict(repository=initial['repository'], commit=commit, capturedAt=datetime.now(timezone.utc).isoformat(), executedCode=False, installed=False, files=list(records.values()), failures=failures, references=references, limits={'files': 24, 'fileBytes': 1024 * 1024}, limitation='Text references include comments; not a formal complete shell execution graph or container image audit')
(dest / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'status': 'captured' if not failures else 'partial', 'files': len(records), 'failures': len(failures), 'executedCode': False}), flush=True)
