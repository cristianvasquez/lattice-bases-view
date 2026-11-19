// A fake Web Worker for the tests of src/worker/client.ts. It runs `handleRequest` of the real protocol after a timer, and copies each
// message with structuredClone and its transfer list, as a real worker boundary does.
import type { WorkerLike, WorkerSource } from '../src/worker/client';
import { handleRequest } from '../src/worker/protocol';

type Listener = (event: Event) => void;
type EventType = 'message' | 'error' | 'messageerror';

export interface FakeWorkerOptions {
  /** The worker script does not start: an 'error' event, no 'ready' message. */
  failStart?: boolean;
  /** Delay in ms before the worker answers a request. */
  delayMs?: number;
}

export class FakeWorker implements WorkerLike {
  terminated = false;
  readonly received: unknown[] = [];
  readonly listeners = new Map<EventType, Set<Listener>>();

  constructor(private readonly options: FakeWorkerOptions = {}) {
    setTimeout(() => {
      if (this.terminated) return;
      if (options.failStart) this.emit('error', new Event('error'));
      else this.reply({ type: 'ready' });
    }, 0);
  }

  get listenerCount(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }

  addEventListener(type: EventType, listener: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: EventType, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message: unknown, transfer: Transferable[]): void {
    if (this.terminated) return;
    const data = structuredClone(message, { transfer });
    this.received.push(data);
    if (this.options.failStart) return;
    setTimeout(() => {
      if (this.terminated) return;
      const out = handleRequest(data);
      if (out) this.reply(out.message, out.transfer);
    }, this.options.delayMs ?? 0);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Sends a message to the UI thread, as the worker script does. */
  reply(message: unknown, transfer: Transferable[] = []): void {
    if (this.terminated) return;
    const event = new MessageEvent('message', { data: structuredClone(message, { transfer }) });
    this.emit('message', event);
  }

  emit(type: EventType, event: Event): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

export class FakeSource implements WorkerSource {
  readonly workers: FakeWorker[] = [];
  disposed = false;

  constructor(
    private readonly options: FakeWorkerOptions & { throwOnCreate?: boolean } = {},
  ) {}

  create(): WorkerLike {
    if (this.options.throwOnCreate) throw new Error('Worker blocked');
    const worker = new FakeWorker(this.options);
    this.workers.push(worker);
    return worker;
  }

  dispose(): void {
    this.disposed = true;
  }
}
