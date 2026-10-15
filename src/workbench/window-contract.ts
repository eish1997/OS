import type { Asset, Snapshot } from '../../shared/contracts';
import type { WindowInstance } from '../../shared/workbench-layout';
export type ViewPatch=Record<string,unknown>|((view:Record<string,unknown>)=>Record<string,unknown>);
export interface WindowContentProps {
  // Window wrappers inherit pointer-events:none. Mark painted interactive content blocks
  // with data-workbench-interactive; leave transparent padding/gaps unmarked so they hit
  // CanvasLayer. Native buttons/inputs/links are enabled by the shared layer stylesheet.
  window:WindowInstance;
  snapshot?:Snapshot;
  patch:(value:ViewPatch)=>void;
  refresh:()=>Promise<void>;
  targets:WindowInstance[];
  onSend:(target:string,asset:Asset)=>void;
}
