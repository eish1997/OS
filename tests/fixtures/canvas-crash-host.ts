import { CanvasService } from '../../server/canvas-service.js';
const service=new CanvasService({entry:process.argv[2],directory:process.argv[3],origin:'http://canvas-private.invalid'});
await service.start();
process.stdout.write(JSON.stringify({childPid:service.processId})+'\n');
setInterval(()=>{},1000);
