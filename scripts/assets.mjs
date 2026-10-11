/**
 * Renders the raster files the repository and the website need, from the
 * brand geometry in scripts/brand.mjs, with Playwright's Chromium:
 *
 *   apps/site/public/apple-touch-icon.png  180 × 180
 *
 * Usage: yarn assets   (after yarn brand)
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { color, markShapes } from './brand.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const font = (pkg, file) =>
  `data:font/woff2;base64,${readFileSync(join(root, 'node_modules', pkg, 'files', file)).toString('base64')}`
const display = font('@fontsource/space-grotesk', 'space-grotesk-latin-700-normal.woff2')
const body = font('@fontsource-variable/hanken-grotesk', 'hanken-grotesk-latin-wght-normal.woff2')

const mark = (shapes) =>
  `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">${shapes}</svg>`

const page = (width, height, ground, ink, content) => `<!doctype html>
<html><head><style>
@font-face { font-family: Display; src: url(${display}); font-weight: 700; }
@font-face { font-family: Body; src: url(${body}); font-weight: 100 900; }
* { margin: 0; box-sizing: border-box; }
html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
body { background: ${ground}; color: ${ink}; font-family: Body; position: relative; }
svg { display: block; width: 100%; height: 100%; }
</style></head><body>${content}</body></html>`

const touchIcon = page(
  180,
  180,
  color.paper,
  color.ink,
  `<div style="padding:22px; width:180px; height:180px">${mark(markShapes())}</div>`,
)

// The banners, social preview and Community cover use real screenshots: scripts/store-assets.mjs.
const JOBS = [['apps/site/public/apple-touch-icon.png', 180, 180, 1, touchIcon]]

const browser = await chromium.launch()
for (const [out, width, height, scale, html] of JOBS) {
  const tab = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
  await tab.setContent(html)
  await tab.evaluate(() => document.fonts.ready)
  mkdirSync(dirname(join(root, out)), { recursive: true })
  await tab.screenshot({ path: join(root, out) })
  await tab.close()
  console.log(`Wrote ${out}`)
}
await browser.close()
