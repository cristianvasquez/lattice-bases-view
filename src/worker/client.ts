// The UI-thread side of the lattice worker: start, cancellation, fallback. No import of `obsidian` and no DOM element; the worker is
// given by a WorkerSource, so that the tests can use a fake worker.
import { type FormalContext, type LatticeResult, buildLattice } from '../fca';
import { buildRequest, isWorkerResponse, unpackResult } from './protocol';

/** The part of the Web Worker interface that the client uses. A real `Worker` is a WorkerLike. */
export interface WorkerLike {
  postMessage(message: unknown, transfer: Transferable[]): void;
  terminate(): void;
  addEventListener(type: 'message' | 'error' | 'messageerror', listener: (event: Event) => void): void;
  removeEventListener(type: 'message' | 'error' | 'messageerror', listener: (event: Event) => void): void;
}

export interface WorkerSource {
  /** A new worker. Throws when a worker cannot be created. */
  create(): WorkerLike;
  /** Releases the resources of the source (the Blob URL). */
  dispose(): void;
}

/** Where the computation ran. 'main-thread' is the time-sliced fallback. */
export type ComputeMode = 'worker' | 'main-thread';

export interface LatticeRun {
  result: LatticeResult;
  mode: ComputeMode;
}

export interface LatticeRequest {
  maxConcepts: number;
  covers?: boolean;
}

export interface LatticeComputerOptions {
  /** The slice length of the fallback on the UI thread (`buildLattice`). */
  sliceMs?: number;
}

interface Job {
  readonly id: number;
  readonly ctx: FormalContext;
  readonly request: LatticeRequest;
  readonly controller: AbortController;
  readonly resolve: (run: LatticeRun) => void;
  readonly reject: (err: Error) => void;
  mode: ComputeMode;
  done: boolean;
}

const CANCELLED: LatticeResult = { concepts: [], covers: [], status: 'cancelled' };

/**
 * Computes the full lattice in a Web Worker, one computation at a time. A new `compute` call cancels the computation that runs.
 * When the source is null, when `create` throws, or when the worker gives an error before its message 'ready', the client computes on the
 * UI thread with the time-sliced `buildLattice`, now and for the later calls. Cancellation terminates the worker (a new worker starts for
 * the next call) and resolves with status 'cancelled'. A result of a cancelled computation is never given.
 */
export class LatticeComputer {
  private worker: WorkerLike | null = null;
  private ready = false;
  private workerFailed = false;
  private disposed = false;
  private job: Job | null = null;
  private nextId = 1;
  private readonly onMessage = (event: Event): void => this.handleMessage((event as MessageEvent).data);
  private readonly onError = (event: Event): void => this.handleError(event);

  constructor(
    private readonly source: WorkerSource | null,
    private readonly options: LatticeComputerOptions = {},
  ) {}

  /** True after a worker failed to start or could not be created: the later calls compute on the UI thread. */
  get usesFallback(): boolean {
    return this.source === null || this.workerFailed;
  }

  /** Resolves with status 'cancelled' when the signal aborts, when a later call starts, or when the client is disposed. Rejects on a computation error. */
  compute(ctx: FormalContext, request: LatticeRequest, signal?: AbortSignal): Promise<LatticeRun> {
    this.cancel();
    if (this.disposed || signal?.aborted) return Promise.resolve({ result: CANCELLED, mode: this.usesFallback ? 'main-thread' : 'worker' });
    return new Promise<LatticeRun>((resolve, reject) => {
      const controller = new AbortController();
      const onAbort = (): void => this.cancel();
      signal?.addEventListener('abort', onAbort, { once: true });
      const job: Job = {
        id: this.nextId++,
        ctx,
        request,
        controller,
        mode: 'worker',
        done: false,
        resolve: (run) => {
          signal?.removeEventListener('abort', onAbort);
          resolve(run);
        },
        reject: (err) => {
          signal?.removeEventListener('abort', onAbort);
          reject(err);
        },
      };
      this.job = job;
      if (!this.startInWorker(job)) this.runOnMainThread(job);
    });
  }

  /** Stops the computation that runs, if any. */
  cancel(): void {
    const job = this.job;
    if (!job) return;
    this.job = null;
    job.controller.abort();
    // A worker job: the worker cannot stop between two messages, so it is terminated. The main-thread job resolves through its signal.
    if (job.mode === 'worker') {
      this.stopWorker();
      this.finish(job, { result: CANCELLED, mode: 'worker' });
    }
  }

  /** Cancels the computation, terminates the worker, removes the listeners and releases the source. The client is not usable after this. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    this.stopWorker();
    this.source?.dispose();
  }

  private startInWorker(job: Job): boolean {
    if (this.usesFallback) return false;
    try {
      if (!this.worker) {
        const worker = this.source!.create();
        worker.addEventListener('message', this.onMessage);
        worker.addEventListener('error', this.onError);
        worker.addEventListener('messageerror', this.onError);
        this.worker = worker;
        this.ready = false;
      }
      const { message, transfer } = buildRequest(job.id, job.ctx, job.request.maxConcepts, job.request.covers ?? true);
      this.worker.postMessage(message, transfer);
      return true;
    } catch {
      // No Worker, a blocked constructor, or a message that cannot be cloned: compute on the UI thread from now on.
      this.workerFailed = true;
      this.stopWorker();
      return false;
    }
  }

  private runOnMainThread(job: Job): void {
    job.mode = 'main-thread';
    const { maxConcepts, covers = true } = job.request;
    buildLattice(job.ctx, { maxConcepts, covers, signal: job.controller.signal, sliceMs: this.options.sliceMs }).then(
      (result) => {
        if (this.job === job) this.job = null;
        this.finish(job, { result: job.controller.signal.aborted ? CANCELLED : result, mode: 'main-thread' });
      },
      (err: unknown) => {
        if (this.job === job) this.job = null;
        if (job.controller.signal.aborted) this.finish(job, { result: CANCELLED, mode: 'main-thread' });
        else this.fail(job, err);
      },
    );
  }

  private handleMessage(data: unknown): void {
    if (!isWorkerResponse(data)) return;
    if (data.type === 'ready') {
      this.ready = true;
      return;
    }
    const job = this.job;
    // A message for a job that is not the current job is never applied.
    if (!job || job.mode !== 'worker' || data.id !== job.id) return;
    this.job = null;
    if (data.type === 'error') {
      this.fail(job, new Error(data.message));
      return;
    }
    try {
      this.finish(job, { result: unpackResult(data.result), mode: 'worker' });
    } catch (err) {
      this.fail(job, err);
    }
  }

  private handleError(event: Event): void {
    event.preventDefault();
    const started = this.ready;
    this.stopWorker();
    const job = this.job;
    if (!started) {
      // The worker script did not start (for example a content security policy): compute on the UI thread from now on.
      this.workerFailed = true;
      if (job && job.mode === 'worker') this.runOnMainThread(job);
      return;
    }
    if (job && job.mode === 'worker') {
      this.job = null;
      const detail = (event as { message?: unknown }).message;
      const message = typeof detail === 'string' ? detail : '';
      this.fail(job, new Error(`The lattice worker failed${message ? `: ${message}` : ''}`));
    }
  }

  private stopWorker(): void {
    const worker = this.worker;
    if (!worker) return;
    this.worker = null;
    this.ready = false;
    worker.removeEventListener('message', this.onMessage);
    worker.removeEventListener('error', this.onError);
    worker.removeEventListener('messageerror', this.onError);
    worker.terminate();
  }

  private finish(job: Job, run: LatticeRun): void {
    if (job.done) return;
    job.done = true;
    job.resolve(run);
  }

  private fail(job: Job, err: unknown): void {
    if (job.done) return;
    job.done = true;
    job.reject(err instanceof Error ? err : new Error(String(err)));
  }
}

