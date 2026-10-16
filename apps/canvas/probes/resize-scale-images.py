"""Build a real JPEG workload near the save budget without padding or dropping images."""
import hashlib
import io
import json
from pathlib import Path
import sys
from PIL import Image

root = Path(sys.argv[1])
target = int(sys.argv[2])
entries = json.loads((root / 'inputs.json').read_text(encoding='utf-8'))

def encode(entry, quality):
    with Image.open(root / entry['file']) as image:
        assert image.size == (1920, 1080)
        result = io.BytesIO()
        image.convert('RGB').save(result, format='JPEG', quality=quality, optimize=False)
        return result.getvalue()

low, high = 1, 95
while low + 1 < high:
    quality = (low + high) // 2
    size = sum(len(encode(entry, quality)) for entry in entries)
    if size < target:
        low = quality
    else:
        high = quality

data = [encode(entry, low) for entry in entries]
total = sum(map(len, data))
for index, entry in enumerate(entries):
    if total >= target:
        break
    replacement = encode(entry, high)
    total += len(replacement) - len(data[index])
    data[index] = replacement
assert target <= total <= target + 128 * 1024, (target, total)
output = []
for index, (entry, content) in enumerate(zip(entries, data)):
    filename = f'output-{index}.jpg'
    (root / filename).write_bytes(content)
    output.append({'oldHash': entry['hash'], 'hash': hashlib.sha1(content).hexdigest(),
                   'file': filename, 'bytes': len(content), 'width': 1920, 'height': 1080})
assert len(output) == 200 and len({entry['hash'] for entry in output}) == 200
(root / 'outputs.json').write_text(json.dumps({'images': output, 'bytes': total,
    'targetImageBytes': target, 'qualities': [low, high]}, indent=2), encoding='utf-8')
