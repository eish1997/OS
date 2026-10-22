/** Browser helpers for Playwright; call via fn.toString() to avoid tsx __name injection in page.evaluate. */
export function measureWide(arg: { bodyCssTarget: number }) {
  const bodyCssTarget = arg.bodyCssTarget;
  const pane = document.querySelector('.wb-chat-pane') as HTMLElement;
  const bodyEl = (document.querySelector('.wb-chat-pane .wb-empty h3') || document.querySelector('.wb-chat-pane .wb-message .wb-markdown')) as HTMLElement | null;
  const input = document.querySelector('.wb-chat-pane .wb-chat-composer textarea') as HTMLElement | null;
  const button = document.querySelector('.wb-chat-pane .wb-chat-composer .wb-chat-hit') as HTMLElement | null;
  const history = document.querySelector('.wb-chat-history') as HTMLElement;
  const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const paneBox = pane.getBoundingClientRect();
  const bodyCssPx = bodyEl ? Number.parseFloat(getComputedStyle(bodyEl).fontSize) : NaN;
  const inputCssPx = input ? Number.parseFloat(getComputedStyle(input).fontSize) : NaN;
  return {
    designAttr: pane.getAttribute('data-chat-design'),
    zoom,
    paneVisualWidth: paneBox.width,
    bodyVisualPx: Number.isFinite(bodyCssPx) ? bodyCssPx * zoom : null,
    inputVisualPx: Number.isFinite(inputCssPx) ? inputCssPx * zoom : null,
    buttonVisualHeight: button ? button.getBoundingClientRect().height : null,
    historyFraction: history.clientHeight / pane.clientHeight,
    cssBodyTarget: bodyCssTarget,
  };
}

export function measureNarrow(minFraction: number) {
  const pane = document.querySelector('.wb-chat-pane') as HTMLElement;
  const history = document.querySelector('.wb-chat-history') as HTMLElement;
  return { historyFraction: history.clientHeight / pane.clientHeight, minFraction };
}
