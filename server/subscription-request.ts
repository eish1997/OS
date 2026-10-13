/** Public Responses plan-usage requirements; no private ChatGPT endpoints. */
export function subscriptionPayload(payload: unknown) {
  if(!payload || typeof payload!=='object' || Array.isArray(payload))throw new Error('Invalid subscription payload');
  const data={...payload} as Record<string,unknown>;
  for(const name of ['background','conversation','max_output_tokens','max_tool_calls','metadata','moderation','multi_agent','prompt','prompt_cache_retention','prompt_cache_options','safety_identifier','temperature','top_logprobs','top_p','truncation','user','previous_response_id'])delete data[name];
  data.store=false;data.stream=true;
  if(Array.isArray(data.tools)&&data.tools.length){
    if(!data.tools.every(t=>t&&typeof t==='object'&&['function','custom'].includes(t.type)))throw new Error('Unsupported hosted subscription tool');
    data.tools=[{type:'namespace',name:'workbench',description:'Host-approved personal workbench tools',tools:data.tools}];
  }
  return data;
}
