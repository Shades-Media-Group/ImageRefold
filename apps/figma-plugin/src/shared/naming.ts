import type { Format, Size } from './messages'

export const EXTENSIONS: Record<Format, string> = {
  webp: 'webp',
  avif: 'avif',
  jpeg: 'jpg',
  png: 'png',
}

/** How a size reads in a file name: 2x, 0.5x, 1200w. */
export const sizeToken = (size: Size) =>
  size.kind === 'scale' ? `${size.value}x` : `${size.value}w`

/**
 * A file name from a pattern. Tokens: {name}, {size} (2x, 1200w), {@size}
 * (empty at 1x, otherwise @2x or @1200w), {width}, {height}. Slashes in layer
 * names become folders, as Figma's own export does.
 */
export function fileName(
  pattern: string,
  layer: { name: string },
  size: Size,
  pixels: { width: number; height: number },
  format: Format,
): string {
  const plain = size.kind === 'scale' && size.value === 1
  const base = pattern
    .replaceAll('{name}', layer.name)
    .replaceAll('{@size}', plain ? '' : `@${sizeToken(size)}`)
    .replaceAll('{size}', sizeToken(size))
    .replaceAll('{width}', String(pixels.width))
    .replaceAll('{height}', String(pixels.height))
  const path = base
    .split('/')
    .map((part) =>
      part
        // eslint-disable-next-line no-control-regex -- control characters are exactly what files cannot hold
        .replace(/[<>:"\\|?*\u0000-\u001f]/g, '-')
        .trim()
        .replace(/^\.+/, ''),
    )
    .filter(Boolean)
    .join('/')
  return `${path || 'image'}.${EXTENSIONS[format]}`
}

/** Makes every name unique by numbering repeats: hero.webp, hero-2.webp. */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const key = name.toLowerCase()
    const count = (seen.get(key) ?? 0) + 1
    seen.set(key, count)
    if (count === 1) return name
    const dot = name.lastIndexOf('.')
    return `${name.slice(0, dot)}-${count}${name.slice(dot)}`
  })
}

const safe = (name: string) => name.replace(/[/\\:*?"<>|]/g, '-').trim()

/**
 * The ZIP's own name, from what was exported: the layer's name for one layer,
 * the shared folder when every layer sits in one ("Icons/Arrow", "Icons/Close"
 * gives Icons), otherwise the first layer and how many more.
 */
export function zipName(layers: string[]): string {
  const names = [...new Set(layers)]
  const folders = new Set(names.map((name) => name.split('/')[0]!.trim()))
  const base =
    names.length === 1
      ? safe(names[0]!)
      : folders.size === 1 && names.every((name) => name.includes('/'))
        ? safe([...folders][0]!)
        : `${safe(names[0]!.split('/').pop()!)} and ${names.length - 1} more`
  return `${base || 'images'}.zip`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(bytes < 10_000 ? 1 : 0)} KB`
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

/** The change from one size to another, as Figma users read it: −64%, +3%. */
export function saving(before: number, after: number): string {
  if (!before) return ''
  const change = Math.round((1 - after / before) * 100)
  return change === 0 ? '0%' : change > 0 ? `−${change}%` : `+${-change}%`
}

/**
 * Sizes typed by hand: "0.5x, 1.5×, 1200" gives scales 0.5 and 1.5 and a
 * 1200 px width. A bare number of 8 or more is a width; below that, a scale.
 * Anything unreadable is left out.
 */
export function parseSizes(text: string): { scales: number[]; widths: number[] } {
  const scales = new Set<number>()
  const widths = new Set<number>()
  for (const part of text.split(/[,\s]+/).filter(Boolean)) {
    const match = /^(\d+(?:\.\d+)?)\s*(x|×|w|px)?$/i.exec(part)
    if (!match) continue
    const value = Number(match[1])
    const unit = match[2]?.toLowerCase()
    if (!(value > 0)) continue
    if (unit === 'x' || unit === '×' || (!unit && value < 8)) {
      if (value <= 8) scales.add(Math.round(value * 100) / 100)
    } else if (value <= 16384) widths.add(Math.round(value))
  }
  return { scales: [...scales].sort((a, b) => a - b), widths: [...widths].sort((a, b) => a - b) }
}

/** The typed sizes as they read back: "0.5x, 1200w". */
export const formatSizes = (scales: number[], widths: number[]) =>
  [...scales.map((s) => `${s}x`), ...widths.map((w) => `${w}w`)].join(', ')
