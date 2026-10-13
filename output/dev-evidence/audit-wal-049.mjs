import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const json=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const base='output/dev-evidence/';
const report=json(base+'verification/report.json');assert.equal(report.status,'passed');
for(const [p,h] of Object.entries(report.baseline))assert.equal(hash(p),h,p);
for(const c of report.checks){assert.equal(c.exitCode,0);assert.equal(hash(base+'verification/'+c.name+'.log'),c.outputSha256);}
const log=readFileSync(base+'verification/integration-tests.log','utf8');assert.equal(Number(log.match(/ℹ tests (\d+)/)?.[1]),137);
const failed=json(base+'wal-049-before.json'),fixed=json(base+'wal-049-after.json');
assert.notEqual(failed.afterRelease,'saved');assert.equal(fixed.afterRelease,'saved');assert(failed.blocked&&fixed.blocked);
const before=json(base+'private/wal-049/before.json'),after=json(base+'private/wal-049/after.json');
assert.equal(before.activeRuns,0);assert.equal(after.activeRuns,0);assert.notEqual(before.health.instanceId,after.health.instanceId);
assert.deepEqual(before.entityHashes,after.entityHashes);assert.deepEqual(before.configurationHashes,after.configurationHashes);assert.equal(before.sessionDigest,after.sessionDigest);assert.equal(before.modelCalls,after.modelCalls);assert(after.assetHashesValid);
const healthResponse=await fetch('http://127.0.0.1:4310/api/health');assert(healthResponse.ok);const health=await healthResponse.json();assert(health.ready);assert.equal(health.instanceId,after.health.instanceId);
const supervisor=json('.runtime/supervisor-workbench.json');assert.equal(supervisor.state,'ready');assert.equal(supervisor.restartCount,0);assert.equal(supervisor.lastError,null);
const result={at:new Date().toISOString(),status:'passed',scope:'Local WAL quota recovery; not complete milestone acceptance',verificationAt:report.at,verificationSha256:hash(base+'verification/report.json'),tests:137,engineeringFiles:Object.keys(report.baseline).length,reproducer:{before:failed.afterRelease,after:fixed.afterRelease,activeReaderStillRejects:true,failedEvidenceSha256:hash(base+'wal-049-before.json'),fixedEvidenceSha256:hash(base+'wal-049-after.json')},production:{health,counts:after.counts,entitiesUnchangedAcrossRestart:true,readyAssetHashesValid:true,sessionsUnchanged:true,configurationAndCredentialFilesUnchanged:true,modelCallsUnchanged:true},supervisor:{pid:supervisor.pid,instance:supervisor.instance,state:supervisor.state,restartCount:supervisor.restartCount,lastError:supervisor.lastError},modelRequestsByThisWork:0,serviceRestartedNormally:true,hostDiskExhausted:false,syntheticWindowsSqliteBoundary:true,browser:'New reading/source interactions pending',userFeedback:'Pending',m0Accepted:false,m1Started:false,goalComplete:false,remoteStage:'Deferred by user'};
writeFileSync(base+'wal-049-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,tests:137,engineeringFiles:result.engineeringFiles,servicePid:health.pid,goalComplete:false}));
