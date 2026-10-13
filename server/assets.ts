import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync, readFileSync, existsSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Asset, Entity, Draft, Task, Run, ProjectSummary, Memory } from '../shared/contracts.js';
import { AppError, Store } from './store.js';
import { AssetSearch } from './search.js';
interface Upload extends Entity { projectId: string; name: string; mime: string; expectedHash?: string; state: 'pending' | 'committing' | 'done' | 'failed'; assetId?: string; error?: string; runId?: string; sourceIds: string[]; parentVersionId?: string }
const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');
export class Assets {
  readonly dir: string; readonly temp: string;
  readonly searchIndex: AssetSearch;
  constructor(private store: Store, dataDir: string, public quotaBytes = 500 * 1024 * 1024, private checkpoint?: (stage: string, upload: Upload) => void) {
    this.dir = join(dataDir, 'assets'); this.temp = join(dataDir, 'uploads'); mkdirSync(this.dir, { recursive: true }); mkdirSync(this.temp, { recursive: true }); this.searchIndex = new AssetSearch(store, asset => this.read(asset)); this.reconcile(); this.searchIndex.reconcile();
  }
  begin(projectId: string, name: string, mime: string, sourceIds: string[] = [], extra: Partial<Upload> = {}) {
    if (!name || name.length > 180 || /[\x00-\x1f\\/]/.test(name)) throw new AppError(400, '文件名不合法');
    return this.store.create<Upload>('upload', { ...extra, projectId, name, mime, sourceIds, state: 'pending' });
  }
  commit(uploadId: string, data: Buffer, expectedHash?: string): Asset {
    return this.store.capacity ? this.store.capacity.exclusive(() => this.commitUnlocked(uploadId, data, expectedHash)) : this.commitUnlocked(uploadId, data, expectedHash);
  }
  private commitUnlocked(uploadId: string, data: Buffer, expectedHash?: string): Asset {
    const upload = this.store.get<Upload>('upload', uploadId);
    if (upload.state === 'done') { const asset = this.store.get<Asset>('asset', upload.assetId!); if (digest(data) !== asset.hash) throw new AppError(409, '上传 ID 对应其他内容'); return asset; }
    if (upload.state !== 'pending') throw new AppError(409, '上传状态需要对账');
    if (data.length > 10 * 1024 * 1024) throw new AppError(413, '单文件上限为 10 MB');
    const hash = digest(data); if (expectedHash && hash !== expectedHash) throw new AppError(422, '文件校验失败');
    const assetId = randomUUID(); const locator = assetId; const pending = join(this.temp, uploadId);
    const usage=this.store.capacity?.assertAll([
      {group:'uploads',growth:existsSync(pending)?0:data.length},
      {group:'assets',growth:data.length,totalGrowth:data.length*4+128*1024},
      {group:'database',growth:data.length*3+64*1024}
    ]);
    const used=usage?usage.groups.assets.bytes:readdirSync(this.dir).reduce((n,file)=>n+statSync(join(this.dir,file)).size,0);
    if(used+data.length>this.quotaBytes)throw new AppError(507,'资产空间已满，请归档或调整配额');
    if (existsSync(pending)) { if (digest(readFileSync(pending)) !== hash) throw new AppError(409, '暂存文件内容不同，请新建上传'); }
    else writeFileSync(pending, data, { flag: 'wx' });
    this.checkpoint?.('staged', upload);
    const operation = this.store.update<Upload>('upload', uploadId, upload.revision, { state: 'committing', assetId, expectedHash: hash });
    this.checkpoint?.('intent', operation);
    renameSync(pending, join(this.dir, locator));
    this.checkpoint?.('renamed', operation);
    return this.finalize(operation, data);
  }
  private finalize(upload: Upload, data: Buffer): Asset {
    return this.store.transaction(() => {
      let parent: Asset | undefined;
      if (upload.parentVersionId) { parent = this.store.get<Asset>('asset', upload.parentVersionId); if (parent.projectId !== upload.projectId) throw new AppError(403, '父版本不属于当前项目'); }
      const asset = this.store.create<Asset>('asset', { id: upload.assetId, projectId: upload.projectId, name: upload.name, tags: parent?.tags ?? [], mime: upload.mime, hash: digest(data), size: data.length, locator: upload.assetId!, version: (parent?.version ?? 0) + 1, parentVersionId: parent?.id, runId: upload.runId, sourceIds: upload.sourceIds, status: 'ready' });
      this.checkpoint?.('registered', upload);
      this.searchIndex.index(asset, data);
      this.store.update<Upload>('upload', upload.id, upload.revision, { state: 'done' }); this.store.event('asset.created', { id: asset.id }, { projectId: asset.projectId, runId: asset.runId, revision: asset.revision }); return asset;
    });
  }
  write(projectId: string, name: string, mime: string, content: string, runId?: string, sourceIds: string[] = []) {
    const upload = this.begin(projectId, name, mime, sourceIds, { runId }); return this.commit(upload.id, Buffer.from(content));
  }
  metadata(id: string, revision: number, name: string, tags: string[]) {
    if (typeof name !== 'string' || !name.trim() || name.length > 180 || /[\x00-\x1f\\/]/.test(name)) throw new AppError(400, '文件名不合法');
    if (!Array.isArray(tags) || tags.length > 20 || !tags.every(t => typeof t === 'string' && t.trim().length > 0 && t.length <= 40 && !/[\x00-\x1f]/.test(t))) throw new AppError(400, '最多20个标签，每个不超过40字');
    return this.store.transaction(() => {
      const current = this.store.get<Asset>('asset', id); const content = this.read(current);
      const next = this.store.update<Asset>('asset', id, revision, { name: name.trim(), tags: [...new Set(tags.map(t => t.trim()))] }); this.searchIndex.index(next, content); this.store.event('asset.metadata', { id, name: next.name, tags: next.tags }, { projectId: next.projectId, revision: next.revision }); return next;
    });
  }
  read(asset: Asset) {
    if (asset.status !== 'ready') throw new AppError(410, '资产已删除，处于保留期');
    if (!/^[a-zA-Z0-9-]+$/.test(asset.locator)) throw new AppError(500, '资产路径无效');
    const data = readFileSync(join(this.dir, asset.locator)); if (digest(data) !== asset.hash) throw new AppError(422, '资产内容被修改，校验失败'); return data;
  }
  remove(id: string, revision: number) {
    const asset = this.store.get<Asset>('asset', id);
    if (asset.status !== 'ready') throw new AppError(409, '资产已经删除');
    const referenced = this.store.list<Memory>('memory').some(m => !m.deleted && m.sourceIds?.includes(id)) || this.store.list<ProjectSummary>('summary').some(s => s.sourceIds.includes(id)) || this.store.list<Draft>('draft').some(d => d.sourceIds.includes(id)) || this.store.list<Asset>('asset').some(a => a.id !== id && a.status === 'ready' && (a.sourceIds.includes(id) || a.parentVersionId === id)) || this.store.list<Task>('task').some(t => (t.context.assetIds.includes(id) || t.context.summary?.sourceIds.includes(id)));
    if (referenced) throw new AppError(409, '资产被记忆、摘要、草稿、任务或其他版本引用，不能删除');
    return this.store.transaction(() => { const next = this.store.update<Asset>('asset', id, revision, { status: 'deleted', deletedAt: new Date().toISOString() }); this.searchIndex.remove(id); this.store.event('asset.deleted', { id, retainedUntil: '30 days; existing backups retain their own policy' }, { projectId: asset.projectId, revision: next.revision }); return next; });
  }
  restore(id: string, revision: number) {
    const asset = this.store.get<Asset>('asset', id); if (asset.status !== 'deleted') throw new AppError(409, '资产不在回收站');
    if (!existsSync(join(this.dir, asset.locator))) throw new AppError(410, '资产保留内容已清理');
    return this.store.transaction(() => { const next = this.store.update<Asset>('asset', id, revision, { status: 'ready', deletedAt: undefined }); this.searchIndex.index(next, this.read(next)); this.store.event('asset.restored', { id }, { projectId: asset.projectId }); return next; });
  }
  purgeExpired(commit = false, now = Date.now()) {
    const candidates = this.store.list<Asset>('asset').filter(a => a.status === 'deleted' && !a.contentRemoved && a.deletedAt && Date.parse(a.deletedAt) < now - 30 * 86400_000);
    const purged: string[] = [];
    for (const asset of candidates) {
      if (this.store.list<Memory>('memory').some(m => !m.deleted && m.sourceIds?.includes(asset.id)) || this.store.list<ProjectSummary>('summary').some(s => s.sourceIds.includes(asset.id)) || this.store.list<Draft>('draft').some(d => d.sourceIds.includes(asset.id)) || this.store.list<Task>('task').some(t => (t.context.assetIds.includes(asset.id) || t.context.summary?.sourceIds.includes(asset.id))) || this.store.list<Asset>('asset').some(a => !a.contentRemoved && a.id !== asset.id && (a.sourceIds.includes(asset.id) || a.parentVersionId === asset.id))) continue;
      if (!/^[a-zA-Z0-9-]+$/.test(asset.locator)) throw new AppError(400, '清理路径无效');
      if (commit) { const file = join(this.dir, asset.locator); if (existsSync(file)) unlinkSync(file); this.store.update<Asset>('asset', asset.id, asset.revision, { contentRemoved: true }); this.store.event('asset.purged', { id: asset.id }, { projectId: asset.projectId }); }
      purged.push(asset.id);
    }
    return { commit, candidates: purged };
  }
  reconcile() {
    for (const upload of this.store.list<Upload>('upload').filter(u => u.state === 'committing')) {
      const path = join(this.dir, upload.assetId!); const temporary = join(this.temp, upload.id);
      try {
        if (!existsSync(path) && existsSync(temporary)) renameSync(temporary, path);
        if (!existsSync(path)) throw new Error('中断上传缺少内容');
        const data = readFileSync(path); if (digest(data) !== upload.expectedHash) throw new Error('中断上传校验不一致');
        this.finalize(upload, data);
      } catch { this.store.update<Upload>('upload', upload.id, upload.revision, { state: 'failed', error: '中断上传未通过对账' }); }
    }
    for (const file of readdirSync(this.temp)) {
      try { const upload = this.store.get<Upload>('upload', file); if (upload.state !== 'pending') unlinkSync(join(this.temp, file)); }
      catch { /* Retain unknown temporary files for diagnosis. */ }
    }
  }
}
