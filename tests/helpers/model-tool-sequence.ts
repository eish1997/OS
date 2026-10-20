import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
/** Fake only model transport: MCP HTTP must still reach the owned real server. */
export function modelToolSequence(root:string,steps:{name:string;args:unknown}[]){
  const source=join(root,'model-transport');mkdirSync(source);const payloads=join(root,'model-payloads.jsonl');
  writeFileSync(join(source,'package.json'),JSON.stringify({name:'owned-model-sequence',pi:{extensions:['transport.mjs']}}));
  writeFileSync(join(source,'transport.mjs'),`import {appendFileSync} from 'node:fs';
    export default pi=>pi.on('session_start',()=>{const original=globalThis.fetch;const steps=${JSON.stringify(steps)};let calls=0;
      globalThis.fetch=async(url,init)=>{
        if(!String(url).startsWith('https://api.openai.com/'))return original(url,init);
        appendFileSync(${JSON.stringify(payloads)},String(init.body)+'\\n');const step=steps[calls++];
        const item=step?{id:'fc'+calls,call_id:'call'+calls,type:'function_call',name:step.name,arguments:JSON.stringify(step.args),status:'completed'}:{id:'msg'+calls,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'SEQUENCE_DONE',annotations:[]}]};
        const events=step?[{type:'response.output_item.added',output_index:0,item:{...item,arguments:''}},{type:'response.function_call_arguments.delta',output_index:0,item_id:item.id,delta:item.arguments}]:[{type:'response.output_item.added',output_index:0,item:{...item,content:[]}},{type:'response.content_part.added',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',output_index:0,content_index:0,delta:'SEQUENCE_DONE'}];
        events.push({type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'response'+calls,status:'completed',output:[item],usage:{input_tokens:100,output_tokens:10,total_tokens:110,input_tokens_details:{cached_tokens:0}}}});
        return new Response(events.map(e=>'event: '+e.type+'\\ndata: '+JSON.stringify(e)+'\\n\\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
      };
    });`);
  return {source,payloads};
}
