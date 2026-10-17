import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { acquireWorkspaceOwner } from './workspace-owner.mjs'
import { startWorkspaceServer } from './server.mjs'

test('management directory rejects a second service until the first fully closes', async () => {
  const directory=mkdtempSync(join(tmpdir(),'canvas-owner-service-'))
  const options={directory,token:'x'.repeat(32),port:0}
  const first=await startWorkspaceServer(options)
  try { await assert.rejects(startWorkspaceServer(options), /active service/) }
  finally { await first.close() }
  const second=await startWorkspaceServer(options)
  await second.close()
})

test('OS ownership lock is released on real process death without deleting a lock file', async () => {
  const directory=mkdtempSync(join(tmpdir(),'canvas-owner-crash-'))
  const source=`import { acquireWorkspaceOwner } from ${JSON.stringify(new URL('./workspace-owner.mjs',import.meta.url).href)}; acquireWorkspaceOwner(process.argv[1]); process.stdout.write('ready\\n'); setInterval(()=>{},1000);`
  const child=spawn(process.execPath,['--input-type=module','-e',source,directory],{stdio:['ignore','pipe','pipe'],windowsHide:true})
  try {
    await once(child.stdout,'data')
    assert.throws(()=>acquireWorkspaceOwner(directory), /active service/)
    const exited=once(child,'exit');child.kill();await exited
    const recovered=acquireWorkspaceOwner(directory)
    recovered.close();recovered.close()
  } finally { if(child.exitCode===null&&child.signalCode===null)child.kill() }
})
