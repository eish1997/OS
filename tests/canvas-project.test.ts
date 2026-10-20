import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CanvasProjectCoordinator } from '../src/workbench/canvas-project.js';

test('project coordinator coalesces unresolved intents and never starts two editor switches',async()=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const opened:(string|null)[]=[],busy:boolean[]=[];let calls=0;
  const coordinator=new CanvasProjectCoordinator(()=>({openContext:async project=>{opened.push(project);}}),async project=>{
    calls++;if(calls===1)await gate;return {projectId:project,canvasId:randomUUID(),draft:true};
  },state=>busy.push(state));
  const first=coordinator.select('A'),second=coordinator.select('B'),third=coordinator.select('C');
  release();assert.equal(await first,false);assert.equal(await second,false);assert.equal(await third,true);
  assert.deepEqual(opened,['C']);assert.deepEqual(busy,[true,false]);
});

test('project coordinator reports failed loads and can continue to the next selection',async()=>{
  const opened:(string|null)[]=[];
  const coordinator=new CanvasProjectCoordinator(()=>({openContext:async project=>{if(project==='bad')throw new Error('saved old document; load failed');opened.push(project);}}),async project=>({projectId:project,canvasId:randomUUID(),draft:true}));
  await assert.rejects(coordinator.select('bad'),/load failed/);
  assert.equal(await coordinator.select('good'),true);assert.deepEqual(opened,['good']);
});
