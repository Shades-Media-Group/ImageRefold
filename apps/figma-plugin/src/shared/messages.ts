/** Messages between the Figma sandbox (main) and the plugin window (ui). */

export type Format = 'webp' | 'avif' | 'jpeg' | 'png'

/** The scales offered as one-click presets; any other size is typed in. */
export const PRESET_SCALES = [1, 2, 3]

/** Settings saved by an earlier version, brought up to date; anything unknown falls back to the default. */
export function migrateSettings(saved: Partial<Settings> & { width?: number | null }): Settings {
  const { width, ...rest } = saved
  const merged = { ...DEFAULT_SETTINGS, ...rest }
  if (!saved.widths && width) merged.widths = [width]
  if (!['light', 'dark', 'auto'].includes(merged.theme)) merged.theme = 'light'
  return merged
}

/** One output size: a multiple of the layer's size, or an exact width in pixels. */
export type Size = { kind: 'scale'; value: number } | { kind: 'width'; value: number }

export type Theme = 'light' | 'dark' | 'auto'

export interface Settings {
  /** Light unless chosen otherwise; 'auto' follows Figma's own theme. */
  theme: Theme
  format: Format
  /** 1–100, the same scale for every lossy format. */
  quality: number
  /** WebP and AVIF only; PNG is always lossless. */
  lossless: boolean
  scales: number[]
  /** Exact widths in pixels, exported as well as the scales. */
  widths: number[]
  /** File name pattern; see naming.ts. */
  pattern: string
  zip: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  format: 'webp',
  quality: 80,
  lossless: false,
  scales: [1],
  widths: [],
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
