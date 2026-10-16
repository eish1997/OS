import assert from 'node:assert/strict'

export async function verifyFileBadges(page, expect, uuid) {
  const badge = page.locator(`[data-slot="local-file-badge"][data-node-id="${uuid}"]`)
  await page.evaluate(() => window.openPencil.getStore().select([]))
  await expect(badge).toHaveText('本地 2 · 缺失 1')
  await expect(badge).toHaveAttribute('data-unavailable', 'true')
  assert.equal(await badge.evaluate(el => getComputedStyle(el).pointerEvents), 'none')
  const through = await badge.evaluate(el => {
    const box = el.getBoundingClientRect()
    return document.elementFromPoint(box.x + 5, box.y + 5)?.getAttribute('data-test-id')
  })
  assert.equal(through, 'canvas-element', 'badge must let pointer input reach the canvas')
  async function positionError() {
    return badge.evaluate((el, uuid) => {
      const s = window.openPencil.getStore()
      const node = [...s.graph.nodes.values()].find(n => n.pluginData.some(p => p.key === 'os.canvas/nodeId' && p.value === uuid))
      const at = s.graph.getAbsolutePosition(node.id)
      const area = document.querySelector('[data-test-id="canvas-area"]').getBoundingClientRect()
      const actual = el.getBoundingClientRect()
      return Math.max(Math.abs(actual.x - (area.x + at.x * s.state.zoom + s.state.panX + 4)),
        Math.abs(actual.bottom - (area.y + at.y * s.state.zoom + s.state.panY - 4)))
    }, uuid)
  }
  await expect.poll(positionError).toBeLessThan(1)
  await page.evaluate(() => window.openPencil.getStore().zoomToLevel(0.75))
  await expect.poll(positionError).toBeLessThan(1)
  await page.evaluate(uuid => {
    const s = window.openPencil.getStore()
    const node = [...s.graph.nodes.values()].find(n => n.pluginData.some(p => p.key === 'os.canvas/nodeId' && p.value === uuid))
    s.graph.updateNode(node.id, { x: 520, visible: false })
    s.requestRender()
  }, uuid)
  await expect(badge).toHaveCount(0)
  await page.evaluate(uuid => {
    const s = window.openPencil.getStore()
    const node = [...s.graph.nodes.values()].find(n => n.pluginData.some(p => p.key === 'os.canvas/nodeId' && p.value === uuid))
    s.graph.updateNode(node.id, { visible: true })
    s.requestRender()
  }, uuid)
  await expect(badge).toBeVisible()
  await expect.poll(positionError).toBeLessThan(1)
  const snapshot = await page.evaluate(() => {
    const s = window.openPencil.getStore()
    return [...s.graph.nodes.keys()]
  })
  await page.getByRole('button', { name: '图层面板', exact: true }).click()
  await expect.poll(positionError).toBeLessThan(1)
  assert.deepEqual(await page.evaluate(() => [...window.openPencil.getStore().graph.nodes.keys()]), snapshot,
    'badge and panel changes must not add scene nodes')
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
}
