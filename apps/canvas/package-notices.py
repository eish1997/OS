"""Assemble verified package texts for the mapped desktop delivery scope."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
directory = root / '.runtime/canvas-third-party'
inventory_path = directory / 'inventory.json'
inventory = json.loads(inventory_path.read_text(encoding='utf-8'))
mapping_path = root / 'output/dev-evidence/canvas-c05/desktop/bundled-notice-map.json'
mapping = json.loads(mapping_path.read_text(encoding='utf-8'))
digest = lambda data: hashlib.sha256(data).hexdigest()
if mapping['inventorySHA256'] != digest(inventory_path.read_bytes()):
    raise ValueError('Stale bundled notice mapping')
if mapping['missingDeclarations'] or mapping['unresolvedInputs']:
    raise ValueError('Resolve mapped package declarations before packaging')
vendor_path = root / 'apps/canvas/third-party/canvaskit/sources.json'
vendor = json.loads(vendor_path.read_text(encoding='utf-8'))
if vendor.get('pendingFetches'):
    raise ValueError('CanvasKit source notice retrieval remains incomplete')
supplements = json.loads((root / 'apps/canvas/third-party/supplements.json').read_text(encoding='utf-8'))
included = {item['file']: item['sha256'] for item in supplements['npm:canvaskit-wasm@0.41.1']['files']}
for item in vendor['files']:
    source = root / 'apps/canvas/third-party' / item['file']
    if included.get(item['file']) != item['sha256'] or digest(source.read_bytes()) != item['sha256']:
        raise ValueError(f"Vendor supplement missing or changed: {item['file']}")
collected_vendor = next(p for p in inventory['records'] if p['kind'] == 'npm' and p['name'] == 'canvaskit-wasm')
if not set(included.values()).issubset({item['sha256'] for item in collected_vendor['texts']}):
    raise ValueError('Refresh inventory to include all vendor supplements')
keys = {p['key'] for p in mapping['mappedPackages']}
selected = [p for p in inventory['records'] if p['kind'] == 'cargo'
            or f"npm:{p['name']}@{p['version']}" in keys]
parts = ['OS Canvas dependency notices\n\n'
         'Scope: emitted UI packages, service loaded-input superset, explicit asset\n'
         'providers, and Windows Cargo dependencies including build dependencies.\n'
         'Node, OpenPencil, Kiwi, Inter and source archives are supplied separately.\n'
         'CanvasKit dependency notices follow its official 0.41.1 release sources,\n'
         'including conservative optional font and runtime notices. Each component\n'
         'retains its own terms; the package license label is not a replacement.\n'
         'This is a source-based notice collection, not a reproducible WASM build.\n']
records = []
for package in sorted(selected, key=lambda p: (p['kind'], p['name'], p['version'])):
    key = f"{package['kind']}:{package['name']}@{package['version']}"
    if not package.get('license') or not package.get('texts'):
        raise ValueError(f'Missing declaration: {key}')
    parts.append(f"\n{'=' * 72}\n{key}\nDeclared license: {package['license']}\n")
    texts = []
    for text in package['texts']:
        path = (directory / text['file']).resolve()
        if not path.is_relative_to(directory.resolve()):
            raise ValueError(f'Notice path outside inventory: {key}')
        data = path.read_bytes()
        if digest(data) != text['sha256']:
            raise ValueError(f'Notice digest mismatch: {key}')
        name = Path(text['original'].replace('\\', '/')).name
        parts.append(f"\n--- {name} / SHA256 {text['sha256']} ---\n" + data.decode('utf-8-sig') + '\n')
        texts.append({'name': name, 'sha256': text['sha256']})
    records.append({'key': key, 'license': package['license'], 'texts': texts})
out = directory / 'distribution'
out.mkdir(parents=True, exist_ok=True)
content = '\n'.join(parts).encode('utf-8')
(out / 'THIRD-PARTY-NOTICES.txt').write_bytes(content)
manifest = {'formatVersion': 1, 'status': 'delivery-notices-assembled',
            'inventorySHA256': digest(inventory_path.read_bytes()),
            'mappingSHA256': digest(mapping_path.read_bytes()),
            'noticesSHA256': digest(content), 'packages': records,
            'vendorSourcesSHA256': digest(vendor_path.read_bytes()),
            'vendorReleaseCommit': vendor['releaseCommit'],
            'boundaries': [vendor['provenance'], vendor['fontScope'],
                           'Conservative dependency scope includes build dependencies and optional source-defined fonts.'],
            'scope': 'Mapped npm and conservative Windows Cargo closure; not a binary-only dependency census'}
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'directory': str(out), 'packages': len(records), 'bytes': len(content),
                  'status': manifest['status']}))
