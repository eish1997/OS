import test from 'node:test';
import assert from 'node:assert/strict';
import {probeChatGPTTransferCrash} from '../scripts/probe-chatgpt-transfer-crash.js';

test('actual source/target process kills recover all three ChatGPT handoff commits with only one refresh owner',{timeout:90000},async()=>{
 const report=await probeChatGPTTransferCrash();assert.equal(report.actualForcedExits,3);assert.equal(report.allOwnedProcessesTerminal,true);assert.equal(report.checks.length,3);assert.equal(report.modelRequests,0);
});
