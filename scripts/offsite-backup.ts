import {resolve} from 'node:path';
import {OffsiteBackup} from '../server/offsite-backup.js';
const [command,binary,configFile,workRoot,sourceOrId,destination]=process.argv.slice(2);
if(!binary||!configFile||!workRoot||!sourceOrId||!['upload','recover'].includes(command))throw new Error('Usage: offsite-backup upload <rclone> <private-config> <work-root> <verified-backup> | recover <rclone> <private-config> <work-root> <snapshot-id> <new-data-dir>');
const transport=new OffsiteBackup({binary:resolve(binary),configFile:resolve(configFile),workRoot:resolve(workRoot)});
const result=command==='upload'?await transport.upload(resolve(sourceOrId),destination):destination?await transport.recover(sourceOrId,resolve(destination)):undefined;
if(!result)throw new Error('Recovery requires a new data directory');const {evidence:_,...publicResult}=result as typeof result&{evidence?:string};console.log(JSON.stringify(publicResult));
