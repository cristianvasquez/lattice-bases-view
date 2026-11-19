// The bundled worker script as text. The esbuild plugin in scripts/worker-bundle.mjs gives this module. Only src/worker/source.ts imports it.
declare module 'virtual:lattice-worker' {
  const source: string;
  export default source;
}
