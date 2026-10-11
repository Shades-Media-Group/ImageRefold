/** Messages between the Figma sandbox (main) and the plugin window (ui). */

export type Format = 'webp' | 'avif' | 'jpeg' | 'png'

/** The scales offered, in order. */
export const SCALES = [0.5, 0.75, 1, 1.5, 2, 3, 4]

/** One output size: a multiple of the layer's size, or an exact width in pixels. */
export type Size = { kind: 'scale'; value: number } | { kind: 'width'; value: number }

export interface Settings {
  format: Format
  /** 1–100, the same scale for every lossy format. */
  quality: number
  /** WebP and AVIF only; PNG is always lossless. */
  lossless: boolean
  scales: number[]
  /** An exact width exported as well as the scales, or null. */
  width: number | null
  /** File name pattern; see naming.ts. */
  pattern: string
  zip: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  format: 'webp',
  quality: 80,
  lossless: false,
  scales: [1],
  width: null,
  pattern: '{name}{@size}',
  zip: true,
}

export interface Layer {
  id: string
  name: string
  width: number
  height: number
}

/** An image used by fills in the file, with the largest size it is shown at. */
export interface PlacedImage {
  hash: string
  /** A layer that uses it, for the row's name. */
  name: string
  /** How many layers use it. */
  uses: number
  /** The image's own pixels. */
  width: number
  height: number
  /** The largest size any layer shows it at, in layer pixels. */
  shownWidth: number
  shownHeight: number
  bytes: Uint8Array
}

export type UiToMain =
  | { type: 'settings'; settings: Settings }
  | { type: 'render'; job: number; ids: string[]; sizes: Size[] }
  | { type: 'scan' }
  | { type: 'replace'; images: { hash: string; bytes: Uint8Array }[] }
  | {
      type: 'place'
      images: { name: string; bytes: Uint8Array; width: number; height: number }[]
      /** Fill the selected layers with the first image instead of placing new ones. */
      fill: boolean
    }
  | { type: 'open-url'; url: string }
  | { type: 'notify'; message: string }

export type MainToUi =
  | { type: 'ready'; settings: Settings; version: string }
  | { type: 'selection'; layers: Layer[]; fillable: number }
  | {
      type: 'rendered'
      job: number
      id: string
      size: Size
      /** Figma's own lossless PNG of the layer at this size. */
      png: Uint8Array
    }
  | { type: 'render-error'; job: number; id: string; size: Size; message: string }
  | { type: 'scanned'; images: PlacedImage[]; scope: 'selection' | 'page' }
  | { type: 'replaced'; count: number }
  | { type: 'placed'; count: number; filled: boolean }
