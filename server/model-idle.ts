/** A stream idle deadline is separate from the Run wall-clock limit. */
export async function* withModelIdleDeadline<T extends { type: string }>(factory: (signal: AbortSignal) => AsyncIterable<T>, parent: AbortSignal | undefined, timeoutMs: number, timedOut: () => void): AsyncGenerator<T> {
  const controller = new AbortController();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { if (timer) clearTimeout(timer); timer = undefined; };
  const arm = () => { clear(); timer = setTimeout(() => { if (!parent?.aborted) { timedOut(); controller.abort(new Error('Model response idle timeout')); } }, timeoutMs); };
  try {
    signal.throwIfAborted(); arm();
    for await (const event of factory(signal)) {
      // Host receipt persistence after a terminal provider event is not network idleness.
      if (event.type === 'done' || event.type === 'error') clear(); else arm();
      yield event;
    }
  } finally { clear(); }
}
