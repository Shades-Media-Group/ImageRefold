// Generates every ImageRefold logo file from one geometry definition.
// Usage: node scripts/brand.mjs   (writes assets/brand/** and the site favicon)
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import opentype from 'opentype.js'
import { chromium } from '@playwright/test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

// The PageRecast palette: the two products read as one family.
export const color = {
  red: '#F9000A',
  rose: '#FF8299',
  ink: '#0A0A0B',
  paper: '#FDFDFC',
}

// The mark, "Scale": one picture at three sizes sharing its bottom-left
// corner, the way an export goes out at 3×, 2× and 1×. Drawn on PageRecast's
// 96-unit grid; the radius shrinks with each size so the corners stay concentric.
const sizes = [
  { s: 80, r: 13, fill: 'red' },
  { s: 54, r: 11, fill: 'rose' },
  { s: 30, r: 8, fill: 'ink' },
]
const corner = { x: 8, y: 88 } // the shared bottom-left corner

const squarePath = ({ s, r }) => {
  const x = corner.x
  const y = corner.y - s
  return `M${x + r} ${y}H${x + s - r}A${r} ${r} 0 0 1 ${x + s} ${y + r}V${y + s - r}A${r} ${r} 0 0 1 ${x + s - r} ${y + s}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + s - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
}

// A size minus the next one grown by `gap`. The cut runs out through the
// shared left and bottom edges, so no two outlines ever touch.
const gap = 5
const bandPath = ({ s, r }, next) => {
  const x = corner.x
  const y = corner.y - s
  const right = x + s
  const holeRight = x + next.s + gap
  const holeTop = corner.y - next.s - gap
  const holeR = next.r + gap
  return `M${x} ${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}H${right - r}A${r} ${r} 0 0 1 ${right} ${y + r}V${corner.y - r}A${r} ${r} 0 0 1 ${right - r} ${corner.y}H${holeRight}V${holeTop + holeR}A${holeR} ${holeR} 0 0 0 ${holeRight - holeR} ${holeTop}H${x}Z`
}

// inkFill: the smallest size, which turns to paper on dark grounds.
export function markShapes({ inkFill = color.ink, mono } = {}) {
  if (mono) {
    // One colour: each size becomes an L-shaped band, with a gap before the next.
    return `<path fill="${mono}" d="${sizes.map((size, i) => (sizes[i + 1] ? bandPath(size, sizes[i + 1]) : squarePath(size))).join('')}"/>`
  }
  return sizes
    .map((size) => {
      const fill = size.fill === 'ink' ? inkFill : color[size.fill]
      return `<path fill="${fill}" d="${squarePath(size)}"/>`
    })
    .join('')
}

const svg = (viewBox, body, title = 'ImageRefold') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`

// opentype.js's own toPathData writes NaN for some coordinates, so serialise here.
const n = (v) => String(Math.round(v * 100) / 100)
const pathData = (commands) =>
  commands
    .map((c) => {
      if (c.type === 'Z') return 'Z'
      if (c.type === 'Q') return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`
      if (c.type === 'C') return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`
      return `${c.type}${n(c.x)} ${n(c.y)}`
    })
    .join('')

async function wordmarkPath() {
  const buffer = await readFile(
    require.resolve('@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff'),
  )
  const font = opentype.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length),
  )
  const size = 100
  const tracking = -0.035 * size
  let x = 0
  const parts = []
  for (const char of 'ImageRefold') {
    const glyph = font.charToGlyph(char)
    parts.push(pathData(glyph.getPath(x, 0, size).commands))
    x += (glyph.advanceWidth / font.unitsPerEm) * size + tracking
  }
  const capHeight = (font.tables.os2.sCapHeight / font.unitsPerEm) * size
  return { d: parts.join(''), width: x - tracking, capHeight }
}

async function main() {
  const out = join(root, 'assets/brand')
  await mkdir(join(out, 'png'), { recursive: true })

  const files = {
    'logomark.svg': svg('0 0 96 96', markShapes()),
    'logomark-dark.svg': svg('0 0 96 96', markShapes({ inkFill: color.paper })),
    'logomark-mono-ink.svg': svg('0 0 96 96', markShapes({ mono: color.ink })),
    'logomark-mono-paper.svg': svg('0 0 96 96', markShapes({ mono: color.paper })),
  }

  // Primary logo: mark + wordmark, with PageRecast's proportions.
  // Mark height = 1.9 × cap height, gap = 0.3 × mark.
  const word = await wordmarkPath()
  const markSize = word.capHeight * 1.9
  const scale = markSize / 96
  const gap = markSize * 0.3
  const baseline = markSize / 2 + word.capHeight / 2
  const width = markSize + gap + word.width
  const lockup = (inkFill, textFill) =>
    svg(
      `0 0 ${width.toFixed(1)} ${markSize.toFixed(1)}`,
      `<g transform="scale(${scale.toFixed(4)})">${markShapes({ inkFill })}</g>` +
        `<path fill="${textFill}" transform="translate(${(markSize + gap).toFixed(1)} ${baseline.toFixed(1)})" d="${word.d}"/>`,
    )
  files['logo.svg'] = lockup(color.ink, color.ink)
  files['logo-dark.svg'] = lockup(color.paper, color.paper)

  // App icon: the mark on a paper tile, for the Figma Community listing.
  files['app-icon.svg'] = svg(
    '0 0 128 128',
    `<rect width="128" height="128" rx="28" fill="${color.paper}"/><g transform="translate(16 16)">${markShapes()}</g>`,
  )

  for (const [name, content] of Object.entries(files)) await writeFile(join(out, name), content)

  // The website's favicon and the wordmark the site draws inline.
  await mkdir(join(root, 'apps/site/public'), { recursive: true })
  await writeFile(join(root, 'apps/site/public/favicon.svg'), files['logomark.svg'])
  await mkdir(join(root, 'apps/site/src'), { recursive: true })
  await writeFile(
    join(root, 'apps/site/src/brand.ts'),
    `// Generated by scripts/brand.mjs. Do not edit by hand.\n` +
      `export const WORDMARK = ${JSON.stringify({ d: word.d, width: Number(word.width.toFixed(2)), capHeight: Number(word.capHeight.toFixed(2)) })}\n`,
  )

  // Raster exports.
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const render = async (markup, size, file) => {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`,
    )
    await page.screenshot({ path: file, omitBackground: true })
  }
  for (const size of [32, 180])
    await render(files['logomark.svg'], size, join(out, `png/logomark-${size}.png`))
  await render(files['app-icon.svg'], 128, join(out, 'png/app-icon-128.png'))
  await render(files['app-icon.svg'], 512, join(out, 'png/app-icon-512.png'))
  await browser.close()

  console.log(`brand: wrote ${Object.keys(files).length} SVGs and 4 PNGs to assets/brand`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
