import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const [input, output] = process.argv.slice(2)
assert.ok(input && output, 'Usage: node analyze-frame-gaps.mjs timeline.json diagnostic.json')
const metrics = JSON.parse(await readFile(input, 'utf8'))
const renders = metrics.timeline.filter(event => event.kind === 'render')
assert.ok(renders.length > 1)
const samples = []
for (let index = 1; index < renders.length; index++) {
  const previous = renders[index - 1], current = renders[index]
  const gapMs = current.at - previous.at
  if (gapMs <= 33) continue
  const between = metrics.timeline.filter(event => event.at > previous.at && event.at < current.at)
  const wheels = between.filter(event => event.kind === 'wheel')
  const rafs = between.filter(event => event.kind === 'raf')
  samples.push({ gapMs, firstInputAfterPreviousMs: wheels.length ? wheels[0].at - previous.at : null,
    idleRaf: rafs.filter(event => event.pending === 0).length,
    pendingRaf: rafs.filter(event => event.pending > 0).length })
}
const report = { input, scope: 'Diagnostic only: original p95, all samples and budget outcomes remain unchanged',
  longIntervals: samples.length, withIdleRefresh: samples.filter(row => row.idleRaf > 0).length,
  withTwoPendingRefreshes: samples.filter(row => row.pendingRaf >= 2).length, samples }
await writeFile(output, JSON.stringify(report, null, 2))
console.log(JSON.stringify({ ...report, samples: undefined }))
