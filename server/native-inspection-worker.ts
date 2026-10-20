import { scanNative, type NativeInspectionInput } from './native-inspection.js';
import { AppError } from './store.js';
process.once('message', (input: NativeInspectionInput) => {
  try { const result = scanNative(input); process.send!({ result: { ...result, workerPeakRss: process.resourceUsage().maxRSS * 1024 } }, () => process.disconnect!()); }
  catch (error) { process.send!({ error: error instanceof AppError ? error.message : '原生会话校验失败，保留原件', status: error instanceof AppError ? error.status : 422 }, () => process.disconnect!()); }
});
