import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
/** Owned offline model transport; real SDK/worker/tools still execute. */
export function steeringTransport(root:string){
  const source=join(root,'plugin');mkdirSync(source);const started=join(root,'started');const release=join(root,'release');const payloads=join(root,'payloads');
  writeFileSync(join(source,'package.json'),JSON.stringify({name:'steering-ui-transport',pi:{extensions:['transport.mjs']}}));
  writeFileSync(join(source,'transport.mjs'),`import {writeFileSync,appendFileSync,existsSync} from 'node:fs';
    export default pi=>pi.on('session_start',()=>{let calls=0;
      pi.registerTool({name:'wait_control',label:'Wait',description:'Controlled wait',parameters:{type:'object',properties:{}},execute:async(_id,_args,signal)=>{writeFileSync(${JSON.stringify(started)},'started');while(!existsSync(${JSON.stringify(release)})&&!signal?.aborted)await new Promise(r=>setTimeout(r,20));return {content:[{type:'text',text:'WAIT_DONE'}],details:{}};}});
      globalThis.fetch=async(_url,init)=>{calls++;appendFileSync(${JSON.stringify(payloads)},String(init.body)+'\\n');
        const item=calls===1?{id:'fc',call_id:'wait-call',type:'function_call',name:'wait_control',arguments:'{}',status:'completed'}:{id:'m'+calls,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'CONTINUED',annotations:[]}]};
        const events=calls===1?[{type:'response.output_item.added',output_index:0,item:{...item,arguments:''}},{type:'response.function_call_arguments.delta',output_index:0,item_id:'fc',delta:'{}'}]:[{type:'response.output_item.added',output_index:0,item:{...item,content:[]}},{type:'response.content_part.added',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',output_index:0,content_index:0,delta:'CONTINUED'}];
        events.push({type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'response'+calls,status:'completed',output:[item],usage:{input_tokens:100,output_tokens:10,total_tokens:110,input_tokens_details:{cached_tokens:0}}}});
        return new Response(events.map(e=>'event: '+e.type+'\\ndata: '+JSON.stringify(e)+'\\n\\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
      };
    });`);
  return {source,started,release,payloads};
}
