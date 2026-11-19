// The real worker source: the bundled worker script in main.js, started from a Blob URL. DOM code; the tests do not import this file.
import workerScript from 'virtual:lattice-worker';
import type { WorkerLike, WorkerSource } from './client';

/**
 * A worker source with one Blob URL for the bundled worker script. `create` throws when the platform has no Worker, or when the
 * constructor fails (for example a content security policy). `dispose` revokes the Blob URL. The URL stays valid until `dispose`,
 * because the client starts a new worker after a cancellation, and a WebView can load the script after the constructor returns.
 */
export function blobWorkerSource(): WorkerSource {
  let url: string | null = null;
  return {
    create(): WorkerLike {
      if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL.createObjectURL !== 'function') throw new Error('Web Workers are not available');
      url ??= URL.createObjectURL(new Blob([workerScript], { type: 'text/javascript' }));
      return new Worker(url, { name: 'lattice-bases-view' });
    },
    dispose(): void {
      if (url !== null) URL.revokeObjectURL(url);
      url = null;
    },
  };
}
