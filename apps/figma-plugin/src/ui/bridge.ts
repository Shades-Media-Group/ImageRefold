import type { Format, Layer, Size, UiToMain } from '../shared/messages'

export const send = (message: UiToMain) => parent.postMessage({ pluginMessage: message }, '*')
export const openUrl = (url: string) => send({ type: 'open-url', url })

/** Optimise keeps twice the largest shown size, for sharp results on high-density screens. */
export const SHOWN_DENSITY = 2

export const MIME: Record<Format, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

/** One file the export will write: a layer at one size. */
export interface Output {
  key: string
  layer: Layer
  size: Size
  png?: Uint8Array
  result?: { bytes: Uint8Array; width: number; height: number }
  error?: string
}
