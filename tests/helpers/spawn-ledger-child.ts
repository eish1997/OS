import { writeFileSync } from 'node:fs';
import { installSpawnLedger } from '../../server/spawn-ledger.js';
import { createLocalBashOperations } from '../../node_modules/@earendil-works/pi-coding-agent/dist/core/tools/bash.js';

const [ledger, grandFile, mode, releaseFile] = process.argv.slice(2);
writeFileSync(`${ledger}.started`, '1');
installSpawnLedger(ledger);
try {
  const operations = createLocalBashOperations();
  const release = (releaseFile ?? '').replaceAll('\\', '/');
  const hold = mode === 'exit' ? `const release='${release}';const wait=()=>{if(require('fs').existsSync(release))process.exit(0);else setTimeout(wait,50)};wait()` : 'setInterval(()=>{},1000)';
  const options = mode === 'exit' ? "{stdio:'ignore',windowsHide:true,detached:true}" : "{stdio:'ignore',windowsHide:true}";
  const unref = mode === 'exit' ? 'grand.unref();' : '';
  const command = `node -e "const {spawn}=require('child_process');const {writeFileSync}=require('fs');const grand=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],${options});${unref}writeFileSync('${grandFile.replaceAll('\\', '/')}',String(grand.pid));${hold}"`;
  const result = await operations.exec(command, process.cwd(), { onData(data) { writeFileSync(`${ledger}.output`, Buffer.isBuffer(data) ? data : Buffer.from(String(data)), { flag: 'a' }); } });
  writeFileSync(`${ledger}.result`, JSON.stringify(result));
} catch (error) {
  writeFileSync(`${ledger}.error`, error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
}
