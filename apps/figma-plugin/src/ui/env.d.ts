/// <reference types="vite/client" />

/** A file's bytes as base64, embedded by build.mjs. */
declare module '*?base64' {
  const base64: string
  export default base64
}

// jSquash's single-threaded codec builds, imported directly (see encode.worker.ts).
declare module '@jsquash/webp/codec/enc/webp_enc.js'
declare module '@jsquash/avif/codec/enc/avif_enc.js'
declare module '@jsquash/jpeg/codec/enc/mozjpeg_enc.js'
declare module '@jsquash/webp/utils.js' {
  export function initEmscriptenModule(
    factory: unknown,
    module?: WebAssembly.Module,
  ): Promise<unknown>
}
