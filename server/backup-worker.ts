import { runBackupJob, scanRecoveryPoints, type BackupJob, type RecoveryScanJob } from './automatic-backup.js';
// One host-created IPC job. No model, HTTP endpoint, arbitrary entry or retries.
process.once('message', (job: BackupJob | RecoveryScanJob) => {
  try {
    const result='type' in job&&job.type==='scan'?scanRecoveryPoints(job):runBackupJob(job as BackupJob);
    process.send!({type:'completed',result},()=>process.disconnect!());
  } catch {
    process.exitCode=1;
    process.send!({type:'failed'},()=>process.disconnect!());
  }
});
