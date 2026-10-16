"""Preserve exact MPL-only Cargo sources alongside desktop distribution notices."""
import hashlib
import json
import shutil
import tarfile
import tomllib
from pathlib import Path, PurePosixPath

root = Path(__file__).resolve().parents[2]
inventory_path = root / '.runtime/canvas-third-party/inventory.json'
inventory = json.loads(inventory_path.read_text(encoding='utf-8'))
lock_path = root / '.runtime/open-pencil-upstream/desktop/Cargo.lock'
lock = tomllib.loads(lock_path.read_text(encoding='utf-8'))
registry = root / '.runtime/canvas-rust/cargo/registry'
output = root / '.runtime/canvas-third-party/source-distribution'
output.mkdir(parents=True, exist_ok=True)
records = []
for package in inventory['records']:
    if package['kind'] != 'cargo' or package.get('license') != 'MPL-2.0':
        continue
    name, version = package['name'], package['version']
    locked = [p for p in lock['package'] if p['name'] == name and p['version'] == version]
    if len(locked) != 1 or not locked[0].get('checksum'):
        raise ValueError(f'No unique registry checksum: {name}@{version}')
    basename = f'{name}-{version}'
    archives = list((registry / 'cache').glob(f'*/{basename}.crate'))
    if len(archives) != 1:
        raise ValueError(f'No unique cached source archive: {basename}')
    archive = archives[0]
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    if digest != locked[0]['checksum']:
        raise ValueError(f'Cargo.lock archive checksum mismatch: {basename}')
    installed = registry / 'src' / archive.parent.name / basename
    checked = set()
    with tarfile.open(archive, 'r:gz') as source:
        for member in source.getmembers():
            path = PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or path.parts[0] != basename:
                raise ValueError(f'Unexpected archive path: {member.name}')
            if member.isdir():
                continue
            if not member.isfile():
                raise ValueError(f'Unsupported archive entry: {member.name}')
            relative = Path(*path.parts[1:])
            if (installed / relative).read_bytes() != source.extractfile(member).read():
                raise ValueError(f'Installed source differs from archive: {member.name}')
            checked.add(relative.as_posix())
    extras = {p.relative_to(installed).as_posix() for p in installed.rglob('*') if p.is_file()} - checked
    extras -= {'.cargo-ok', '.cargo-checksum.json'}
    if extras:
        raise ValueError(f'Unaccounted installed source files: {basename}: {sorted(extras)}')
    shutil.copyfile(archive, output / archive.name)
    records.append({'name': name, 'version': version, 'license': package['license'],
                    'archive': archive.name, 'sha256': digest, 'verifiedFiles': len(checked),
                    'repository': package.get('repository'),
                    'sourceURL': f'https://crates.io/api/v1/crates/{name}/{version}/download',
                    'installedSourceMatchesArchive': True})
manifest = {'formatVersion': 1, 'scope': 'Exact MPL-2.0 Cargo packages, including build dependencies; not a complete vendor audit',
            'inventorySHA256': hashlib.sha256(inventory_path.read_bytes()).hexdigest(),
            'cargoLockSHA256': hashlib.sha256(lock_path.read_bytes()).hexdigest(), 'packages': records}
(output / 'sources.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
(output / 'README.txt').write_text(
    'MPL-2.0 dependency source archives\n\n'
    'The accompanying .crate files are gzip-compressed tar archives containing the exact\n'
    'published source packages. Extract them with a tar-compatible archive tool.\n'
    'sources.json lists versions, upstream locations and SHA256 checksums verified against\n'
    'Cargo.lock. Installed package files were compared byte for byte with these archives.\n'
    'Original notices and build manifests are preserved inside each archive.\n'
    'This directory covers the MPL-only Cargo dependencies, not every application source.\n', encoding='utf-8')
print(json.dumps({'directory': str(output), 'packages': len(records),
                  'verifiedSourceFiles': sum(p['verifiedFiles'] for p in records)}))
