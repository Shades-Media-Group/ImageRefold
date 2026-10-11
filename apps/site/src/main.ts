import '@fontsource-variable/hanken-grotesk/wght.css'
import './common.css'
import './site.css'
import 'shades-gradient/preferences.css'
import type { ConsentLabels } from 'shades-gradient/consent'
import { preferences, type PreferenceLabels } from 'shades-gradient/preferences'
import logo from '../../../assets/brand/logo.svg?raw'
import { fill, lang, strings } from './strings'

declare const __VERSION__: string

// The wordmark follows the text colour, so the logo works in both themes.
const themedLogo = logo.replace('fill="#0A0A0B" transform', 'fill="currentColor" transform')
for (const el of document.querySelectorAll('[data-logo]')) el.innerHTML = themedLogo
// The footer sign-off: the wordmark alone, its viewBox fitted to the letters.
for (const el of document.querySelectorAll('[data-wordmark]')) {
  const word = themedLogo.match(/<path fill="currentColor"[^>]*\/>/)?.[0]
  if (!word) continue
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g>${word}</g></svg>`
  const svg = el.querySelector('svg')!
  const box = svg.querySelector('g')!.getBBox()
  svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`)
}
for (const el of document.querySelectorAll('[data-version]')) el.textContent = __VERSION__

// The language menu closes like a menu: on Escape and on a click outside it.
for (const menu of document.querySelectorAll<HTMLDetailsElement>('details.lang')) {
  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target as Node)) menu.open = false
  })
  menu.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !menu.open) return
    menu.open = false
    menu.querySelector('summary')?.focus()
  })
}

// Reveal chapters as they scroll into view.
document.documentElement.classList.add('js')
const reveal = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        reveal.unobserve(entry.target)
      }
    }
  },
  { rootMargin: '0px 0px -12% 0px' },
)
for (const el of document.querySelectorAll('[data-reveal]')) reveal.observe(el)

/** The home page's translated strings (i18n/<lang>.json, home.try.runtime). */
interface TryStrings {
  saved: string
  larger: string
  same: string
  caption: string
  lossless: string
  error: string
}

const bytes = (n: number) => {
  const units = ['B', 'KB', 'MB']
  let i = 0
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000
    i++
  }
  return `${n.toLocaleString(lang, { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`
}
const percent = (n: number) =>
  n.toLocaleString(lang, { style: 'percent', maximumFractionDigits: 0 })
const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}
const NAMES: Record<string, string> = {
  'image/webp': 'WebP',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
}

/**
 * The signature moment: the visitor's own image, compressed by their browser,
 * with the original and the result side by side. Nothing leaves the page.
 */
function tryIt() {
  const root = document.querySelector<HTMLElement>('[data-try]')
  if (!root) return
  const t = strings<TryStrings>()
  const $ = <T extends Element>(name: string) => root.querySelector<T>(`[data-try-${name}]`)!
  const fileInput = $<HTMLInputElement>('file')
  const formats = $<HTMLElement>('formats')
  const qualityRow = $<HTMLElement>('quality-row')
  const quality = $<HTMLInputElement>('quality')
  const qualityValue = $<HTMLOutputElement>('quality-value')
  const original = $<HTMLImageElement>('original')
  const result = $<HTMLImageElement>('result')
  const afterWrap = $<HTMLElement>('after-wrap')
  const split = $<HTMLInputElement>('split')
  const before = $<HTMLElement>('before')
  const after = $<HTMLElement>('after')
  const saved = $<HTMLElement>('saved')
  const caption = $<HTMLElement>('caption')
  const download = $<HTMLAnchorElement>('download')

  let source: { blob: Blob; name: string; bitmap: ImageBitmap } | undefined
  let format = 'image/webp'
  let resultUrl = ''
  let originalUrl = ''
  let run = 0

  const encode = async () => {
    if (!source) return
    const id = ++run
    const { bitmap } = source
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    // JPG has no transparency: flatten onto white, as an export would.
    if (format === 'image/jpeg') {
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    context.drawImage(bitmap, 0, 0)
    const lossless = format === 'image/png'
    const blob = await canvas.convertToBlob({ type: format, quality: Number(quality.value) / 100 })
    if (id !== run) return
    URL.revokeObjectURL(resultUrl)
    resultUrl = URL.createObjectURL(blob)
    result.src = resultUrl
    const change = 1 - blob.size / source.blob.size
    before.textContent = bytes(source.blob.size)
    after.textContent = bytes(blob.size)
    saved.textContent =
      Math.abs(change) < 0.005
        ? t.same
        : fill(change > 0 ? t.saved : t.larger, { percent: percent(Math.abs(change)) })
    caption.textContent = fill(lossless ? t.lossless : t.caption, {
      format: NAMES[format]!,
      quality: quality.value,
    })
    download.href = resultUrl
    download.download = `${source.name.replace(/\.[^.]+$/, '')}.${EXTENSIONS[format]}`
    download.hidden = false
  }

  let pending = 0
  const schedule = () => {
    clearTimeout(pending)
    pending = window.setTimeout(encode, 120)
  }

  const load = async (blob: Blob, name: string) => {
    try {
      const bitmap = await createImageBitmap(blob)
      source?.bitmap.close()
      source = { blob, name, bitmap }
      URL.revokeObjectURL(originalUrl)
      originalUrl = URL.createObjectURL(blob)
      original.src = originalUrl
      root.classList.add('has-image')
      await encode()
    } catch {
      saved.textContent = t.error
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (file) void load(file, file.name)
  })
  const drop = fileInput.closest('label')!
  for (const type of ['dragenter', 'dragover'])
    drop.addEventListener(type, (event) => {
      event.preventDefault()
      drop.classList.add('is-over')
    })
  for (const type of ['dragleave', 'drop'])
    drop.addEventListener(type, () => drop.classList.remove('is-over'))
  drop.addEventListener('drop', (event) => {
    event.preventDefault()
    const file = event.dataTransfer?.files[0]
    if (file?.type.startsWith('image/')) void load(file, file.name)
  })

  formats.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
    if (!button?.dataset.format) return
    format = button.dataset.format
    for (const b of formats.querySelectorAll('button'))
      b.setAttribute('aria-checked', String(b === button))
    qualityRow.hidden = format === 'image/png'
    void encode()
  })
  quality.addEventListener('input', () => {
    qualityValue.textContent = quality.value
    schedule()
  })
  const setSplit = () => afterWrap.style.setProperty('--split', `${split.value}%`)
  split.addEventListener('input', setSplit)
  setSplit()

  // Start with a real image from this site: the social card.
  void fetch('/social-preview.png')
    .then((response) => response.blob())
    .then((blob) => (source ? undefined : load(blob, 'imagerefold-social-card.png')))
}
tryIt()

// The display and accessibility panel, shared with every Shades site.
const shared = strings<{ prefs: PreferenceLabels; consent: ConsentLabels }>()
preferences({ labels: shared.prefs, consent: shared.consent })
