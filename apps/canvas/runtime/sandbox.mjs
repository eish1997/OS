import { Worker } from 'node:worker_threads'

// engine/assets are trusted host configuration, never fields from a guest message.
// This first prototype returns JSON views; it does not execute guest DOM or JSX.
export function runSandbox({ engine, workerURL = new URL('./sandbox-worker.mjs', import.meta.url), source, assets = {}, cpuMs = 100, wallMs = 3000, signal, onStarted }) {
  if (typeof source !== 'string' || source.length > 128 * 1024) throw new Error('Invalid guest source')
  if (!Number.isFinite(cpuMs) || cpuMs < 1 || cpuMs > 1000) throw new Error('Invalid CPU budget')
  if (!Number.isFinite(wallMs) || wallMs < 1 || wallMs > 10000) throw new Error('Invalid wall budget')
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerURL, {
      // The native host launches the service with --input-type=module --eval.
      // File-backed workers must not inherit those parent-only CLI flags.
      execArgv: [], workerData: { engine, source, assets, cpuMs }, resourceLimits: { maxOldGenerationSizeMb: 64 }
    })
    let settled = false
    const finish = async (result, error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      await worker.terminate()
      if (error) reject(error)
      else resolve(result)
    }
    const abort = () => { void finish({ status: 'canceled' }) }
    const timer = setTimeout(() => { void finish({ status: 'terminated', reason: 'wall-budget' }) }, wallMs)
    worker.on('message', result => {
      if (result.event === 'ready') {
        try { onStarted?.() } catch (error) { void finish(null, error) }
      } else void finish(result)
    })
    worker.once('error', error => { void finish(null, error) })
    worker.once('exit', code => {
      if (!settled) void finish(null, new Error(`Worker exited without a result: ${code}`))
    })
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}
