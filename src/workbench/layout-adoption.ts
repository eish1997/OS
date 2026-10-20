export type LayoutProjectId = string | null;
export type LayoutAdoptionResult = 'applied' | 'stale' | 'superseded';
type StillCurrent = () => boolean;

/** Applies a layout snapshot only after the canvas accepts its project.
 * A newer claim or a local edit keeps the current layout. Editor adoption of an
 * already confirmed project must not be counted as a local edit. */
export class LayoutAdoption {
  private ticket = 0;
  private edits = 0;
  private depth = 0;
  constructor(private readonly open: (projectId: LayoutProjectId) => Promise<boolean>) {}
  get editStamp() { return this.edits; }
  get pending() { return this.depth > 0; }
  noteEdit() { this.edits += 1; }
  claim() { return ++this.ticket; }
  owns(owner: number) { return owner === this.ticket; }
  async commit(owner: number, current: LayoutProjectId, next: LayoutProjectId, editedAt: number, apply: (stillCurrent: StillCurrent) => void | Promise<void>): Promise<LayoutAdoptionResult> {
    const currentOwner = () => owner === this.ticket && this.edits === editedAt;
    this.depth += 1;
    try {
      if (owner !== this.ticket) return 'superseded';
      if (current !== next) {
        let opened = false;
        try { opened = await this.open(next); }
        catch (error) {
          if (owner === this.ticket) throw error;
          return 'superseded';
        }
        if (!opened || owner !== this.ticket) return 'superseded';
      }
      if (owner !== this.ticket) return 'superseded';
      if (this.edits !== editedAt) {
        if (current !== next) {
          const reverted = await this.open(current);
          if (!reverted || owner !== this.ticket) throw new Error('布局已保留，但画板未能回到原项目');
        }
        return 'stale';
      }
      try { await apply(currentOwner); }
      catch (error) {
        if (owner === this.ticket && current !== next) {
          const reverted = await this.open(current);
          if (!reverted) throw new Error('布局未能替换，画板也未能回到原项目', { cause: error });
        }
        throw error;
      }
      return owner === this.ticket ? 'applied' : 'superseded';
    } finally { this.depth -= 1; }
  }
}
