// Prototype adapter for an already-created native webview. Geometry comes from
// the rendered canvas anchor, never from a second writable scene model.
export function followWebSurface({ anchor, panels, clipTo = () => ({ left: 0, top: 0, right: innerWidth, bottom: innerHeight }), invoke, onError = () => {}, onState = () => {} }) {
  let stopped = false, frame = 0, pending = null, busy = false, last = '', applied = null
  const read = () => {
    const rect = anchor.getBoundingClientRect()
    const visible = anchor.isConnected && rect.width > 0 && rect.height > 0
      && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight
      && getComputedStyle(anchor).visibility !== 'hidden' && getComputedStyle(anchor).display !== 'none'
    const zoom = anchor.offsetWidth ? rect.width / anchor.offsetWidth : 1
    const holes = panels().filter(panel => panel.isConnected && getComputedStyle(panel).visibility !== 'hidden'
      && getComputedStyle(panel).display !== 'none').map(panel => panel.getBoundingClientRect())
      .filter(panel => panel.right > rect.left && panel.left < rect.right && panel.bottom > rect.top && panel.top < rect.bottom)
      .map(panel => [panel.left - rect.left, panel.top - rect.top, panel.width, panel.height])
    const clip = clipTo()
    const left = Math.max(0, Math.min(rect.width, clip.left - rect.left))
    const right = Math.max(left, Math.min(rect.width, clip.right - rect.left))
    const top = Math.max(0, Math.min(rect.height, clip.top - rect.top))
    const bottom = Math.max(top, Math.min(rect.height, clip.bottom - rect.top))
    holes.push(...[[0, 0, rect.width, top], [0, bottom, rect.width, rect.height - bottom],
      [0, top, left, bottom - top], [right, top, rect.width - right, bottom - top]]
      .filter(hole => hole[2] > 0 && hole[3] > 0))
    const suspended = zoom < 0.25 || zoom > 4 ? 'zoom-outside-native-range' : null
    return { visible: visible && !suspended, suspended, bounds: [rect.left, rect.top, rect.width, rect.height], zoom, holes, dpi: devicePixelRatio }
  }
  async function drain() {
    if (busy) return
    busy = true
    try {
      while (pending && !stopped) {
        const state = pending
        pending = null
        if (!state.visible) await invoke({ action: 'hide' })
        else {
          await invoke({ action: 'layout', bounds: state.bounds, zoom: state.zoom, occlusions: state.holes })
          if (stopped) break
          if (!applied?.visible) await invoke({ action: 'show' })
        }
        applied = state
        onState(state)
      }
    } catch (error) {
      stopped = true
      cancelAnimationFrame(frame)
      // A failed geometry update must not leave an interactive stale surface.
      await invoke({ action: 'hide' }).catch(() => {})
      onError(error)
    } finally { busy = false }
  }
  function tick() {
    if (stopped) return
    const state = read(), key = JSON.stringify(state)
    if (key !== last) { last = key; pending = state; void drain() }
    frame = requestAnimationFrame(tick)
  }
  tick()
  return {
    get applied() { return applied },
    async stop() {
      stopped = true
      pending = null
      cancelAnimationFrame(frame)
      // Serialize teardown after a command already in flight.
      while (busy) await new Promise(resolve => setTimeout(resolve, 0))
      await invoke({ action: 'hide' })
    }
  }
}
