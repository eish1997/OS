/**
 * CHAT-02 frozen measurable baselines for the chat pane.
 * Visual sizes are browser-100% targets AFTER ancestor CSS zoom.
 * With html{zoom:.75}, CSS px must be visual / zoom to meet these targets.
 */
export const CHAT_UI_DESIGN = {
  version: '2026-10-22-layout-v2c',
  browserZoomBaseline: 1,
  workbenchHtmlZoom: 0.75,
  /** Chat chrome density vs CHAT-02 baseline (user: ~80%). */
  densityScale: 0.8,
  typography: {
    bodyVisualPx: 11.2,
    controlVisualPx: 10.4,
    metaVisualPx: 9.6,
  },
  hitTarget: {
    pointerVisualMinPx: 25.6,
    touchVisualMinPx: 35.2,
  },
  layout: {
    /** New empty space sample at 1366×900 prefers a chat surface ≥ this visual width. */
    preferredMainChatVisualPx: 640,
    /** Compact / narrow chat container visual width threshold. */
    narrowContainerVisualPx: 420,
    /** At 800×600, message history should keep ≥ this fraction of the chat pane height. */
    messageAreaMinFraction: 0.4,
  },
  composer: {
    initialRows: 3,
    maxAutoRows: 12,
    expandLabel: '展开编辑',
    collapseLabel: '还原输入',
  },
  scroll: {
    /** Same message element; relative offset within history viewport. */
    anchorOffsetTolerancePx: 8,
  },
  keys: {
    newline: 'Enter',
    submit: 'Ctrl/Meta+Enter',
    imeGuard: 'isComposing or keyCode===229 must not submit',
  },
  pureImagePrompt: '请添加文字说明后发送',
  defaultPlacement: {
    /** Prefer largest empty leaf by area; ties → rightmost then bottom-most. */
    algorithm: 'largest-empty-leaf',
    /** Never silently rewrite an existing manual layout; offer focus instead. */
    preserveManualLayout: true,
    focusActionLabel: '聚焦对话',
  },
} as const;

export function cssPxForVisual(visualPx: number, htmlZoom = CHAT_UI_DESIGN.workbenchHtmlZoom): number {
  return visualPx / htmlZoom;
}
