import React,{useState} from 'react';

export function McpServerForm({disabled,onAdd}:{disabled:boolean;onAdd:(name:string,definition:Record<string,unknown>)=>void}){
  const [name,setName]=useState('');const [transport,setTransport]=useState('http');const [address,setAddress]=useState('');const [args,setArgs]=useState('');const [exposure,setExposure]=useState('codemode');const [error,setError]=useState('');
  const add=()=>{
    setError('');try{
      if(!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name.trim()))throw new Error('名称需以英文字母开头，最多64个字母、数字、下划线或连字符');
      if(!address.trim())throw new Error(transport==='http'?'请填写服务地址':'请填写服务启动程序');
      if(transport==='http'){const url=new URL(address.trim());if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('请使用不含账号密码的HTTP或HTTPS地址');}
      onAdd(name.trim(),transport==='http'?{url:address.trim(),exposure}:{command:address.trim(),args:args.split(/\r?\n/).filter(line=>line.length>0),exposure});
      setName('');setAddress('');setArgs('');
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  return <details><summary>用表单添加服务</summary><fieldset disabled={disabled} aria-label="添加MCP服务">
    <label>服务名称<input aria-label="新MCP服务名称" value={name} onChange={e=>setName(e.target.value)} placeholder="例如 docs"/></label>
    <label>连接方式<select aria-label="新MCP连接方式" value={transport} onChange={e=>{setTransport(e.target.value);setAddress('');}}><option value="http">HTTP 服务</option><option value="stdio">本地程序（stdio）</option></select></label>
    <label>{transport==='http'?'服务地址':'启动程序'}<input aria-label="新MCP服务地址或程序" value={address} onChange={e=>setAddress(e.target.value)} placeholder={transport==='http'?'https://服务地址/mcp':'程序路径，例如 C:\\工具\\server.exe'}/></label>
    {transport==='stdio'&&<label>启动参数（每行一个）<textarea aria-label="新MCP启动参数" rows={3} value={args} onChange={e=>setArgs(e.target.value)}/></label>}
    <label>工具使用方式<select aria-label="新MCP工具使用方式" value={exposure} onChange={e=>setExposure(e.target.value)}><option value="codemode">通过 codemode 编排调用</option><option value="deferred">先搜索，再调用</option><option value="direct">直接提供给模型</option><option value="hidden">隐藏，不可调用</option></select></label>
    <p className="wb-caption">本地程序必须已在服务端安装。参数逐行原样传递，不需要加引号，也不要填写完整安装命令。认证、环境变量和项目覆盖仍在下方JSON中配置。</p>
    <button type="button" onClick={add}>加入待预览配置</button>{error&&<p role="alert" className="wb-inline-error">{error}</p>}
  </fieldset></details>;
}
