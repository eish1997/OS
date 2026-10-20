import { randomUUID } from 'node:crypto'
import { runSandbox } from './sandbox.mjs'

export function createNodeRuns({ engine, workerURL, assets = {} }) {
  const jobs = new Map()
  const publicJob = job => ({ id: job.id, status: job.status, result: job.result })
  return {
    start(source) {
      if (typeof source !== 'string' || source.length > 128 * 1024) throw new Error('Invalid source')
      if ([...jobs.values()].filter(job => job.status === 'running').length >= 2) throw new Error('Two instances are already running')
      if (jobs.size >= 32) {
        const oldest = [...jobs.values()].find(job => job.status !== 'running')
        if (oldest) jobs.delete(oldest.id)
      }
      const job = { id: randomUUID(), status: 'running', controller: new AbortController() }
      jobs.set(job.id, job)
      job.finished = runSandbox({ engine, workerURL, assets, source, cpuMs: 1000, wallMs: 3000, signal: job.controller.signal })
        .then(result => { job.result = result; job.status = result.status })
        .catch(error => { job.status = 'runtime-error'; job.result = { error: String(error) } })
      return publicJob(job)
    },
    get(id) { const job = jobs.get(id); return job ? publicJob(job) : null },
    async cancel(id) {
      const job = jobs.get(id)
      if (!job) return null
      job.controller.abort()
      await job.finished
      return publicJob(job)
    },
    async close() {
      for (const job of jobs.values()) job.controller.abort()
      await Promise.all([...jobs.values()].map(job => job.finished))
      jobs.clear()
    }
  }
}
