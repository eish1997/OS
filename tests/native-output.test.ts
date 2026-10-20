import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,linkSync,appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRunOutputDirectory,nativeOutputChunks} from '../server/native-output.js';

test('native output reads owned UTF8 files incrementally and rejects unrelated, linked or changing files',async()=>{
  const root=mkdtempSync(join(tmpdir(),'native-output-'));const directory=createRunOutputDirectory(root,'project','run');
  const path=join(directory,'pi-powershell-0123456789abcdef.log');const text='a'.repeat(8191)+'界🙂'.repeat(10000);writeFileSync(path,text);
  const chunks:string[]=[];for await(const chunk of nativeOutputChunks(directory,path,'powershell')){assert(chunk.length<=16384);chunks.push(chunk);}assert.equal(chunks.join(''),text);
  const read=async(file:string,tool='powershell')=>{for await(const _ of nativeOutputChunks(directory,file,tool)){};};
  await assert.rejects(read(join(root,'private.txt')),/不属于/);await assert.rejects(read(path,'read'),/不属于/);
  const other=join(directory,'pi-powershell-abcdef0123456789.log');linkSync(path,other);await assert.rejects(read(other),/普通文件/);
  const changing=join(directory,'pi-powershell-1111111111111111.log');writeFileSync(changing,'b'.repeat(20000));
  const iterator=nativeOutputChunks(directory,changing,'powershell');await iterator.next();appendFileSync(changing,'changed');
  let readCharacters=8192;
  await assert.rejects(async()=>{for await(const chunk of iterator){readCharacters+=chunk.length;appendFileSync(changing,'still growing');}},/变化/);
  assert.equal(readCharacters,20000,'reader must stop at the original size even when the file grows');
});
