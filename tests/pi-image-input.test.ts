import test from 'node:test';
import assert from 'node:assert/strict';
import {imagesForPrompt} from '../server/pi-image-input.js';

test('only retries deduplicate images still in effective user history',()=>{
  const first={type:'image' as const,mimeType:'image/png',data:'first'};
  const second={...first,data:'second'};
  const history=[{role:'user',content:[{type:'text',text:'prior'},first]}];
  assert.deepEqual(imagesForPrompt([first,second],history,true),[second]);
  assert.deepEqual(imagesForPrompt([first],history,false),[first],'new user input retains explicitly selected image');
  assert.deepEqual(imagesForPrompt([first],[{role:'user',content:'summary without image'}],true),[first],'compacted-away images must be supplied again');
  assert.deepEqual(imagesForPrompt([first],[{role:'toolResult',content:[first]}],true),[first],'tool output does not claim prior user attachment');
  assert.deepEqual(imagesForPrompt([first],[{role:'user',content:[{...first,mimeType:'image/jpeg'}]}],true),[first]);
});
