// Screenshots the real plugin window, then renders the Figma Community cover,
// the README banners and the social preview from those screenshots.
// Usage: yarn build && node scripts/store-assets.mjs
import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { chromium } from '@playwright/test'
import { color, markShapes } from './brand.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const source = join(root, 'assets/store/source')
const store = join(root, 'assets/store')
const brand = join(root, 'assets/brand')
await mkdir(source, { recursive: true })

// The repository over HTTP, for the harness that stands in for Figma.
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}
const server = createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname))
  try {
    const body = await readFile(join(root, path))
    response.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' })
    response.end(body)
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((resolve) => server.listen(0, resolve))
const origin = `http://localhost:${server.address().port}`

const browser = await chromium.launch()

/** One state of the plugin window, at 2× like a Retina screen. */
async function capture(file, { theme = 'light', tab, settings }) {
  const page = await browser.newPage({
    viewport: { width: 480, height: 720 },
    deviceScaleFactor: 2,
  })
  await page.addInitScript(
    (saved) => localStorage.setItem('settings', JSON.stringify(saved)),
    // The panel's own theme setting picks light or dark.
    { ...settings, theme },
  )
  await page.goto(
    `${origin}/apps/figma-plugin/harness.html${theme === 'dark' ? '?theme=dark' : ''}`,
  )
  const frame = page.frameLocator('#plugin')
  await frame.locator('.dock button:not([disabled])').waitFor({ timeout: 30_000 })
  if (tab) {
    await frame.getByRole('tab', { name: tab }).click()
    await frame.locator('.dock button').waitFor({ timeout: 30_000 })
  } else {
    // Every file encoded: no spinner left in the list.
    await frame
      .locator('.files .ir-spinner')
      .first()
      .waitFor({ state: 'detached', timeout: 60_000 })
  }
  await page.waitForTimeout(400)
  await page.locator('#plugin').screenshot({ path: join(source, file) })
  await page.close()
  console.log(`Captured ${file}`)
}

const exportSettings = {
  theme: 'light',
  format: 'webp',
  quality: 80,
  lossless: false,
  scales: [1, 2],
  widths: [],
  pattern: '{name}{@size}',
  zip: true,
}
await capture('plugin-export-light.png', { settings: exportSettings })
await capture('plugin-export-dark.png', { theme: 'dark', settings: exportSettings })
await capture('plugin-optimise-light.png', { tab: 'Optimise', settings: exportSettings })
await capture('plugin-optimise-dark.png', {
  theme: 'dark',
  tab: 'Optimise',
  settings: exportSettings,
})
server.close()

// Composition, after PageRecast's store images: a red field, the logo, one
// white line, and two real panels running off the bottom edge.
const b64 = async (path) => (await readFile(path)).toString('base64')
const shot = async (name) => `data:image/png;base64,${await b64(join(source, name))}`
const font = await b64(
  require.resolve('@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2'),
)
// On red, the largest square turns paper; the wordmark is white.
const logoOnRed = (await readFile(join(brand, 'logo-dark.svg'), 'utf8')).replace(
  /<g transform="scale\(([\d.]+)\)">.*?<\/g>/,
  (_, scale) => `<g transform="scale(${scale})">${markShapes({ redFill: color.paper })}</g>`,
)

const shots = {
  export: {
    light: await shot('plugin-export-light.png'),
    dark: await shot('plugin-export-dark.png'),
  },
  optimise: {
    light: await shot('plugin-optimise-light.png'),
    dark: await shot('plugin-optimise-dark.png'),
  },
}

const base = `<style>
@font-face { font-family: 'Hanken Grotesk'; font-weight: 100 900; src: url(data:font/woff2;base64,${font}) format('woff2'); }
* { box-sizing: border-box; margin: 0; }
html, body { width: 100%; height: 100%; }
body { font-family: 'Hanken Grotesk', sans-serif; -webkit-font-smoothing: antialiased; overflow: hidden; position: relative;
  background: ${color.red}; color: ${color.paper}; }
.logo { position: absolute; }
.logo svg { display: block; height: 100%; width: auto; }
h1 { position: absolute; font-weight: 720; letter-spacing: -0.045em; line-height: 0.96; }
p { position: absolute; font-weight: 600; letter-spacing: -0.01em; }
.panel { position: absolute; display: block; height: auto; border-radius: var(--r); }
</style>`

const panel = (src, s, x, y, w) =>
  `<img class="panel" src="${src}" style="--r:${14 * s}px; left:${x}px; top:${y}px; width:${w}px; box-shadow: 0 0 0 ${s}px rgba(10,10,11,.1), 0 ${2 * s}px ${4 * s}px rgba(90,0,0,.28), 0 ${32 * s}px ${64 * s}px -${16 * s}px rgba(70,0,0,.6);">`

/** Laid out on a 1280 × 640 grid, scaled to fit and centred for other ratios. */
const hero = (theme, { width, height }) => {
  const s = Math.min(height / 640, width / 1280)
  const dy = (height - 640 * s) / 2
  const right = width - 64 * s
  return `${base}<style>
  .logo { left: ${72 * s}px; top: ${64 * s + dy}px; height: ${38 * s}px; }
  h1 { left: ${68 * s}px; top: ${204 * s + dy}px; font-size: ${74 * s}px; }
  p { left: ${72 * s}px; bottom: ${60 * s + dy}px; font-size: ${24 * s}px; line-height: 1.3; }
  </style>
  <div class="logo">${logoOnRed}</div>
  <h1>Lighter images,<br>straight<br>from Figma.</h1>
  <p>Free and open source.<br>Nothing leaves your computer.</p>
  ${panel(shots.export[theme], s, right - 634 * s, 72 * s + dy, 300 * s)}
  ${panel(shots.optimise[theme], s, right - 310 * s, 160 * s + dy, 310 * s)}`
}

const JOBS = [
  ['assets/store/figma-cover.png', 1920, 1080, 1, hero('light', { width: 1920, height: 1080 })],
  [
    'assets/brand/readme-banner-light.png',
    1280,
    640,
    2,
    hero('light', { width: 1280, height: 640 }),
  ],
  ['assets/brand/readme-banner-dark.png', 1280, 640, 2, hero('dark', { width: 1280, height: 640 })],
  ['assets/brand/social-preview.png', 1280, 640, 1, hero('light', { width: 1280, height: 640 })],
]
await mkdir(store, { recursive: true })
for (const [out, width, height, scale, html] of JOBS) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
  await page.setContent(html)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: join(root, out) })
  await page.close()
  console.log(`Wrote ${out}`)
}
await browser.close()
