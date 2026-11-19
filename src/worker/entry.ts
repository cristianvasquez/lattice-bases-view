// The worker entry. esbuild bundles this file to a string (scripts/worker-bundle.mjs) that main.js starts from a Blob URL.
// It runs in a DedicatedWorkerGlobalScope: no DOM, no `obsidian`.
import { type Outgoing, type WorkerResponse, handleRequest } from './protocol';

interface WorkerScope {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: WorkerResponse, transfer: ArrayBuffer[]): void;
}

const scope = self as unknown as WorkerScope;
const post = ({ message, transfer }: Outgoing<WorkerResponse>): void => scope.postMessage(message, transfer);

scope.onmessage = (event) => {
  const out = handleRequest(event.data);
  if (out) post(out);
};
post({ message: { type: 'ready' }, transfer: [] });
