import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Verify a candidate before executing its service; no source checkout fallback. */
export function loadCanvasPackage(directory: string) {
  const root=resolve(directory);
  if(lstatSync(root).isSymbolicLink())throw new Error('Canvas package cannot be a link');
  const manifestPath=join(root,'manifest.json');
  if(lstatSync(manifestPath).isSymbolicLink()||lstatSync(manifestPath).size>2*1024*1024)throw new Error('Invalid canvas manifest');
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  if(manifest.formatVersion!==1||manifest.kind!=='workbench-canvas'||manifest.ui!=='ui'||manifest.service!=='service/workspace.mjs'||!Array.isArray(manifest.files)||manifest.files.length>5000)throw new Error('Unsupported canvas package');
  const seen=new Set<string>();let bytes=0;
  for(const file of manifest.files) {
    if(typeof file.path!=='string'||!file.path||file.path.includes('\\')||file.path.includes(':')||file.path.startsWith('/')||file.path.split('/').some((p:string)=>!p||p==='.'||p==='..')||seen.has(file.path)||!Number.isSafeInteger(file.bytes)||file.bytes<0||!/^[a-f0-9]{64}$/.test(file.sha256))throw new Error('Invalid canvas resource manifest');
    bytes+=file.bytes;if(bytes>512*1024*1024)throw new Error('Canvas package exceeds resource limit');
    let current=root;
    for(const part of file.path.split('/')){current=join(current,part);if(lstatSync(current).isSymbolicLink())throw new Error('Canvas package contains a link');}
    const stat=lstatSync(current);
    if(!stat.isFile()||stat.size!==file.bytes||createHash('sha256').update(readFileSync(current)).digest('hex')!==file.sha256)throw new Error('Canvas package resource checksum mismatch');
    seen.add(file.path);
  }
  if(!seen.has('ui/index.html')||!seen.has('ui/canvaskit.wasm')||!seen.has('service/workspace.mjs'))throw new Error('Canvas package is incomplete');
  return {root,staticDir:join(root,'ui'),entry:join(root,'service/workspace.mjs')};
}
