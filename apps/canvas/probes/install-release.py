"""Install a completed NSIS build into a fresh test directory and verify resources/data."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--installer', type=Path, required=True)
parser.add_argument('--resources', type=Path, required=True)
parser.add_argument('--previous-record', type=Path, required=True)
parser.add_argument('--record', type=Path, required=True)
args = parser.parse_args()
if args.record.exists():
    raise SystemExit('Evidence record already exists; inspect it before starting another installation')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(directory):
    return {str(p.relative_to(directory)): digest(p) for p in directory.rglob('*') if p.is_file()}


stage = args.resources.resolve(strict=True)
manifest = json.loads((stage / 'resources.json').read_text(encoding='utf-8'))
assert manifest['applicationIdentifier'] == 'local.os.canvas' and not manifest['validationOnly']
for entry in manifest['files']:
    source = (stage / entry['path']).resolve(strict=True)
    assert source.is_relative_to(stage)
    assert digest(source) == entry['sha256'], str(source)

previous = json.loads(args.previous_record.read_text(encoding='utf-8-sig'))
old_exe = Path(previous['directory']) / 'OpenPencil.exe'
old_hash = digest(old_exe)
data = Path(os.environ['LOCALAPPDATA']) / 'local.os.canvas/canvas'
before = inventory(data)
destination = Path(tempfile.mkdtemp(prefix='oscanvas-verified-install-'))
record = {'installer': str(args.installer.resolve(strict=True)), 'installerSha256': digest(args.installer),
          'directory': str(destination), 'previousDirectory': previous['directory'],
          'previousExecutableSha256': old_hash, 'dataFilesBefore': before,
          'arguments': ['/S', '/NS', '/UPDATE', '/D=' + str(destination)], 'status': 'installing'}


def save():
    args.record.write_text(json.dumps(record, indent=2), encoding='utf-8')


save()
try:
    process = subprocess.run([record['installer'], *record['arguments']], timeout=180)
    record['exitCode'] = process.returncode
    assert process.returncode == 0
    assert digest(old_exe) == old_hash
    assert inventory(data) == before, 'Application data changed during installation'
    verified = []
    for entry in manifest['files']:
        if entry['path'].startswith(('licenses/', 'runtime/')) or entry['path'] == 'service/desktop-service.mjs':
            target = destination / 'canvas' / entry['path']
            assert digest(target) == entry['sha256'], str(target)
            verified.append(entry['path'])
    assert (destination / 'canvas/resources.json').read_bytes() == (stage / 'resources.json').read_bytes()
    exe = destination / 'OpenPencil.exe'
    record.update(executable=str(exe), sha256=digest(exe), status='installed-data-preserved',
                  verifiedInstalledResources=verified)
except BaseException as error:
    record.update(status='failed', error=str(error))
    raise
finally:
    save()
print(json.dumps({key: record[key] for key in ['status', 'directory', 'sha256']}))
