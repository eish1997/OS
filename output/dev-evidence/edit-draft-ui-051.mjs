import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const path='src/main.tsx';let source=readFileSync(path,'utf8');
const edits=[
 ['</div>{showHistory && <div className="conversation">','</div>{project && section === "drafts" && draftSelections[project.id] && <div className="composer-hint"><span>当前文章 · {draftSelections[project.id]!.title || "未命名草稿"}</span><span>发送前保存修改</span></div>}{showHistory && <div className="conversation">'],
 ['{run.resultAssetIds.length} 个成果</span>','{run.resultAssetIds.length} 个文件{run.resultDraftIds?.length ? ` · ${run.resultDraftIds.length} 篇稿件已更新` : ""}</span>']
];
for(const [before,after] of edits){assert.equal(source.split(before).length,2,before);source=source.replace(before,after);}
writeFileSync(path,source);
