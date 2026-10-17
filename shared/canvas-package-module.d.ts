declare module '*canvas-package.mjs' {
  export function decodeCanvasPackage(bytes: Uint8Array): {
    manifest: { canvasId: string; references: { mounts: Array<{ canvasId: string }> } };
  };
  export function encodeCanvasPackage(value: {
    canvasId: string;
    revisions: Array<{ canvasId: string; revision: number; sceneHash: string; scene: Uint8Array; metadata: { formatVersion: number; name?: string }; createdAt: string }>;
    layout: { formatVersion: number; panels: { layers: boolean; properties: boolean } };
    references: { formatVersion: number; mounts: unknown[]; files: unknown[] };
  }): Buffer;
}
