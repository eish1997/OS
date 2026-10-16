"""Map emitted frontend modules and loaded service inputs to collected package notices."""
import hashlib
import json
import os
from pathlib import Path

root = Path.cwd()
evidence = root / 'output/dev-evidence/canvas-c05/desktop'
inventory_path = root / '.runtime/canvas-third-party/inventory.json'
inventory = json.loads(inventory_path.read_text(encoding='utf-8'))
ui = json.loads((evidence / 'ui-build-inputs.json').read_text(encoding='utf-8'))
service = json.loads((root / '.runtime/canvas-desktop-service/inputs.json').read_text(encoding='utf-8'))
packages, virtual, unresolved, project_sources = {}, [], [], []

def add_package(path, origin):
    path = path.resolve()
    for parent in [path if path.is_dir() else path.parent, *path.parents]:
        manifest = parent / 'package.json'
        if not manifest.is_file():
            continue
        pkg = json.loads(manifest.read_text(encoding='utf-8'))
        if not pkg.get('name'):
            continue
        if parent == root or parent == root / '.runtime/open-pencil-upstream' or pkg.get('name') == '@open-pencil/vite-config':
            project_sources.append({'manifest': str(manifest.relative_to(root)), 'origin': origin})
            return
        key = f"npm:{pkg.get('name')}@{pkg.get('version')}"
        packages.setdefault(key, set()).add(origin)
        return
    unresolved.append({'path': str(path), 'origin': origin, 'reason': 'package-owner-not-found'})

for origin, inputs in [('ui-chunk', ui['modules']), ('service-loaded', service['inputs'])]:
    for item in inputs:
        if '\0' in item or 'virtual:' in item or '/~icons/' in item or item.endswith('/__vite-browser-external'):
            virtual.append({'id': item, 'origin': origin})
            continue
        path = Path(item.split('?', 1)[0])
        if not path.is_absolute():
            path = root / path
        if path.is_file():
            add_package(path, origin)
        else:
            unresolved.append({'path': item, 'origin': origin, 'reason': 'input-not-a-file'})

# These sources generate or copy assets and can disappear from the emitted JS module list.
for name in ['canvaskit-wasm', '@iconify-json/lucide', '@lobehub/icons-static-svg', 'workbox-window']:
    add_package(root / '.runtime/open-pencil-upstream/node_modules' / name / 'package.json', 'explicit-asset-source')
records = {f"{r['kind']}:{r['name']}@{r['version']}": r for r in inventory['records']}
if os.environ.get('OS_CANVAS_NODE_RUNTIME_DIR'):
    runtime_root = Path(os.environ['OS_CANVAS_NODE_RUNTIME_DIR']).resolve()
    runtime = json.loads((runtime_root / 'runtime.json').read_text(encoding='utf-8'))
    for name in runtime['packages']:
        add_package(runtime_root / 'node_modules' / name / 'package.json', 'copied-node-runtime')
mapped = []
for key, origins in sorted(packages.items()):
    mapped.append({'key': key, 'origins': sorted(origins), 'declaration': records.get(key)})
    if key not in records:
        unresolved.append({'key': key, 'reason': 'not-in-conservative-inventory'})
missing = [row for row in inventory['missing'] if row['key'] in packages and row['reason'] != 'optional-not-installed']
result = {'status': 'mapped-review-required', 'scope': 'Frontend emitted chunks plus service loaded-file superset and explicit copied/generated asset producers; Rust remains separate',
          'inventorySHA256': hashlib.sha256(inventory_path.read_bytes()).hexdigest(),
          'mappedPackages': mapped, 'missingDeclarations': missing, 'virtualInputs': virtual, 'unresolvedInputs': unresolved,
          'projectSources': sorted({json.dumps(row, sort_keys=True) for row in project_sources})}
(evidence / 'bundled-notice-map.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'packages': len(mapped), 'missingDeclarations': len(missing), 'unresolvedInputs': len(unresolved), 'virtualInputs': len(virtual)}))
for row in missing:
    print(json.dumps(row))
