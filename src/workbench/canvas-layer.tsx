import React from 'react';

/** Mount the upcoming canvas here. UI gaps deliver native pointer/wheel events to this layer. */
export function CanvasLayer({children}:{children?:React.ReactNode}) {
  return <div className="wb-canvas-layer" data-workbench-layer="canvas" aria-label="画板工作区">{children}</div>;
}
