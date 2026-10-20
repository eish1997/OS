import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {IncrementalSha256} from '../shared/sha256.js';

test('incremental sha256 matches node across chunk boundaries and refuses a second digest',()=>{
  for(const size of [0,1,55,56,63,64,65,1000,4096]){
    const bytes=randomBytes(size);
    const expected=createHash('sha256').update(bytes).digest('hex');
    const whole=new IncrementalSha256();whole.update(bytes);assert.equal(whole.digestHex(),expected);
    const split=new IncrementalSha256();
    for(let offset=0;offset<bytes.length;offset+=1000)split.update(bytes.subarray(offset,offset+1000));
    assert.equal(split.digestHex(),expected);
    assert.throws(()=>split.digestHex(),/校验已结束/);
  }
  const known=new IncrementalSha256();known.update(Buffer.from('abc'));
  assert.equal(known.digestHex(),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
