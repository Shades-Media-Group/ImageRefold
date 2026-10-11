import type { Format } from '../shared/messages'
// Inlined into the plugin as a blob worker: nothing is loaded from anywhere.
import EncodeWorker from './encode.worker?worker&inline'

export interface EncodeRequest {
  id: number
  /** Any image the browser can decode: Figma's PNG, or a file the user dropped. */
  bytes: Uint8Array
  /** 'figma': JPG for opaque images, PNG for transparent ones, the formats Figma can hold. */
  format: Format | 'figma'
  quality: number
  lossless: boolean
  /** Shrink to fit inside these, keeping the aspect ratio. */
  maxWidth?: number
  maxHeight?: number
}

export type EncodeResult =
  | { id: number; bytes: Uint8Array; width: number; height: number; format: Format }
  | { id: number; error: string }

/**
 * One quality slider for every format. AVIF reaches the same look at a lower
 * number, so its scale is mapped: 80 for WebP and JPG matches about 53 for AVIF,
 * the ratio between the reference encoders' own defaults (75 and 50).
 */
export const avifQuality = (quality: number) => Math.round((quality * 50) / 75)

/** Sends work to the encoder worker and pairs each answer with its request. */
export class Encoder {
  private worker: Worker = new EncodeWorker()
  private next = 0
  private pending = new Map<number, (result: EncodeResult) => void>()

  constructor() {
    this.worker.onmessage = (event: MessageEvent<EncodeResult>) => {
      this.pending.get(event.data.id)?.(event.data)
      this.pending.delete(event.data.id)
    }
  }

  encode(request: Omit<EncodeRequest, 'id'>) {
    const id = ++this.next
    return new Promise<Extract<EncodeResult, { bytes: Uint8Array }>>((resolve, reject) => {
      this.pending.set(id, (result) =>
        'error' in result ? reject(new Error(result.error)) : resolve(result),
      )
      this.worker.postMessage({ ...request, id })
    })
  }
}
