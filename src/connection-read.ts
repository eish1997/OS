export interface ConnectionReadOptions {
  signal: AbortSignal;
  onWaiting?: () => void;
  timeoutMs?: number;
  delaysMs?: readonly number[];
}
export class ConnectionUnauthorized extends Error {
  constructor(){super('Connection authentication expired');}
}

function delay(ms:number, signal:AbortSignal) {
  return new Promise<void>((done,reject)=>{
    signal.throwIfAborted();
    const abort=()=>{clearTimeout(timer);reject(signal.reason);};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);done();},ms);
    signal.addEventListener('abort',abort,{once:true});
  });
}

// Only idempotent connection reads retry. A submitted goal or upload is never
// passed through this function: uncertain writes still require reconciliation.
export async function connectionRead<T>(url:string, options:ConnectionReadOptions):Promise<T> {
  const delays=options.delaysMs??[1000,2000,5000];
  if(!delays.length||delays.some(n=>!Number.isFinite(n)||n<=0))throw new Error('Invalid connection retry delay');
  let failures=0;
  while(true) {
    options.signal.throwIfAborted();
    try {
      const response=await fetch(url,{method:'GET',cache:'no-store',credentials:'same-origin',signal:AbortSignal.any([options.signal,AbortSignal.timeout(options.timeoutMs??8000)])});
      if(response.status===401)throw new ConnectionUnauthorized();
      if(!response.ok)throw new Error('Connection read HTTP '+response.status);
      const value=await response.json() as T;
      options.signal.throwIfAborted();return value;
    }catch(error){
      if(options.signal.aborted)throw options.signal.reason;
      if(error instanceof ConnectionUnauthorized)throw error;
      options.onWaiting?.();
      await delay(delays[Math.min(failures++,delays.length-1)],options.signal);
    }
  }
}
