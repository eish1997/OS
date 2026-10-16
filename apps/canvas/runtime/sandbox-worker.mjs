// Prototype: guest code only executes inside QuickJS, never in Node's JS realm.
import { parentPort, workerData } from 'node:worker_threads'
import { createRequire } from 'node:module'

const { newQuickJSWASMModule } = createRequire(import.meta.url)(workerData.engine)
const engine = await newQuickJSWASMModule()
const runtime = engine.newRuntime()
runtime.setMemoryLimit(16 * 1024 * 1024)
runtime.setMaxStackSize(256 * 1024)
const deadline = performance.now() + workerData.cpuMs
runtime.setInterruptHandler(() => performance.now() >= deadline)
const context = runtime.newContext()
parentPort.postMessage({ event: 'ready' })
const calls = []
try {
  const capability = context.newFunction('capability', (nameHandle, argumentHandle) => {
    const name = context.getString(nameHandle), argument = context.getString(argumentHandle)
    const allowed = name === 'asset.readText' && Object.hasOwn(workerData.assets, argument)
    if (calls.length >= 64) throw new Error('Capability request limit exceeded')
    calls.push({ name, argument: argument.slice(0, 128), allowed })
    // Transfer JSON text only; never expose a host object or function to the guest.
    return context.newString(JSON.stringify(allowed
      ? { ok: true, value: workerData.assets[argument] }
      : { ok: false, error: 'CAPABILITY_DENIED' }))
  })
  context.setProp(context.global, 'capability', capability)
  capability.dispose()
  const result = context.evalCode(`JSON.stringify((() => {\n${workerData.source}\n})())`, 'node-draft.js')
  if (result.error) {
    const error = context.dump(result.error)
    result.error.dispose()
    parentPort.postMessage({ status: 'guest-error', error, calls })
  } else {
    const json = context.getString(result.value)
    result.value.dispose()
    if (json.length > 1024 * 1024) throw new Error('Guest result too large')
    parentPort.postMessage({ status: 'completed', value: JSON.parse(json), calls })
  }
} catch (error) {
  parentPort.postMessage({ status: 'runtime-error', error: String(error), calls })
} finally {
  context.dispose()
  runtime.dispose()
}
