import type { ComponentChildren } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { zipSync } from 'fflate'
import {
  Button,
  CREDIT,
  IconButton,
  Logo,
  Message,
  Progress,
  REPO_URL,
  Section,
  Segmented,
  Tabs,
  Toggle,
} from './kit'
import {
  DEFAULT_SETTINGS,
  SCALES,
  type Format,
  type Layer,
  type MainToUi,
  type PlacedImage,
  type Settings,
  type Size,
  type UiToMain,
} from '../shared/messages'
import { fileName, formatBytes, saving, sizeToken, uniqueNames, zipName } from '../shared/naming'
import { Encoder } from './encoding'

type Tab = 'export' | 'optimise' | 'import'

const TABS: { value: Tab; label: string }[] = [
  { value: 'export', label: 'Export' },
  { value: 'optimise', label: 'Optimise' },
  { value: 'import', label: 'Import' },
]

const FORMATS: { value: Format; label: string }[] = [
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'jpeg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
]

/** Figma holds images up to 4096 px on a side. */
const FIGMA_MAX = 4096
/** Optimise keeps twice the largest shown size, for sharp results on high-density screens. */
const SHOWN_DENSITY = 2

const send = (message: UiToMain) => parent.postMessage({ pluginMessage: message }, '*')
const openUrl = (url: string) => send({ type: 'open-url', url })
const encoder = new Encoder()

/** One file the export will write: a layer at one size. */
interface Output {
  key: string
  layer: Layer
  size: Size
  png?: Uint8Array
  result?: { bytes: Uint8Array; width: number; height: number }
  error?: string
}

function download(name: string, bytes: Uint8Array, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const MIME: Record<Format, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

const sizesOf = (settings: Settings): Size[] => [
  ...settings.scales.map((value): Size => ({ kind: 'scale', value })),
  ...(settings.width ? [{ kind: 'width', value: settings.width } as Size] : []),
]

export function App() {
  const [tab, setTab] = useState<Tab>('export')
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [version, setVersion] = useState('')
  const [layers, setLayers] = useState<Layer[]>([])
  const [fillable, setFillable] = useState(0)
  const [outputs, setOutputs] = useState<Output[]>([])
  const [focus, setFocus] = useState('')
  const [scan, setScan] = useState<{ images: PlacedImage[]; scope: 'selection' | 'page' } | null>(
    null,
  )
  const [work, setWork] = useState<{ label: string; progress: number } | null>(null)
  const [report, setReport] = useState<{ tone: 'success' | 'info' | 'error'; text: string } | null>(
    null,
  )
  const [dragging, setDragging] = useState(false)
  const [fill, setFill] = useState(true)
  const job = useRef(0)
  const encodeRun = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  /** Every PNG Figma has sent for the current selection, kept in step with the messages. */
  const pngs = useRef(new Map<string, Uint8Array>())

  /** Saves a change; a function reads the latest settings, so quick clicks never undo each other. */
  const save = (next: Partial<Settings> | ((current: Settings) => Partial<Settings>)) => {
    const patch = typeof next === 'function' ? next(settingsRef.current) : next
    const merged = (settingsRef.current = { ...settingsRef.current, ...patch })
    setSettings(merged)
    send({ type: 'settings', settings: merged })
  }

  /** Encodes one output with the current settings; PNG never comes out larger than Figma's own. */
  const encodeOne = async (output: Pick<Output, 'key' | 'png'>, run: number) => {
    if (!output.png) return
    const { format, quality, lossless } = settingsRef.current
    try {
      const result = await encoder.encode({ bytes: output.png, format, quality, lossless })
      if (run !== encodeRun.current) return
      const smaller =
        format === 'png' && result.bytes.length >= output.png.length
          ? { ...result, bytes: output.png }
          : result
      setOutputs((all) =>
        all.map((o) => (o.key === output.key ? { ...o, result: smaller, error: undefined } : o)),
      )
    } catch (error) {
      if (run !== encodeRun.current) return
      const message = error instanceof Error ? error.message : String(error)
      setOutputs((all) => all.map((o) => (o.key === output.key ? { ...o, error: message } : o)))
    }
  }

  // Messages from Figma. A layout effect runs right after the first render, before any
  // message can arrive, so the 'ready' Figma sends at start is never missed.
  useLayoutEffect(() => {
    onmessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage as MainToUi | undefined
      if (!message) return
      switch (message.type) {
        case 'ready':
          setSettings(message.settings)
          setVersion(message.version)
          break
        case 'selection':
          setLayers(message.layers)
          setFillable(message.fillable)
          break
        case 'rendered': {
          if (message.job !== job.current) return
          const key = `${message.id}:${sizeToken(message.size)}`
          pngs.current.set(key, message.png)
          setOutputs((all) => all.map((o) => (o.key === key ? { ...o, png: message.png } : o)))
          void encodeOne({ key, png: message.png }, encodeRun.current)
          break
        }
        case 'render-error': {
          if (message.job !== job.current) return
          const key = `${message.id}:${sizeToken(message.size)}`
          setOutputs((all) =>
            all.map((o) => (o.key === key ? { ...o, error: message.message } : o)),
          )
          break
        }
        case 'scanned':
          setScan({ images: message.images, scope: message.scope })
          break
        case 'replaced':
          break
        case 'placed':
          setWork(null)
          setReport({
            tone: 'success',
            text: message.filled
              ? `Filled ${message.count} ${message.count === 1 ? 'layer' : 'layers'}.`
              : `Placed ${message.count} ${message.count === 1 ? 'image' : 'images'} on the canvas.`,
          })
          break
      }
    }
  }, [])

  // A new selection or new sizes: render every layer at every size.
  const sizes = useMemo(() => sizesOf(settings), [settings.scales, settings.width])
  useEffect(() => {
    if (tab !== 'export') return
    // The job number keeps renders from an older selection out; encodes stay valid,
    // since only a change of format or quality makes them stale.
    const id = ++job.current
    pngs.current = new Map()
    const next = layers.flatMap((layer) =>
      sizes.map((size) => ({ key: `${layer.id}:${sizeToken(size)}`, layer, size })),
    )
    setOutputs(next)
    setFocus((current) => (next.some((o) => o.key === current) ? current : (next[0]?.key ?? '')))
    if (next.length) send({ type: 'render', job: id, ids: layers.map((l) => l.id), sizes })
  }, [layers, sizes, tab])

  // A new format or quality: encode again from the PNGs already rendered.
  useEffect(() => {
    const run = ++encodeRun.current
    const timer = setTimeout(() => {
      // Clear, then encode every PNG received so far; any arriving later is encoded as it lands.
      const ready = pngs.current
      setOutputs((all) =>
        all.map((o) => (ready.has(o.key) ? { ...o, result: undefined, error: undefined } : o)),
      )
      for (const [key, png] of ready) void encodeOne({ key, png }, run)
    }, 200)
    return () => clearTimeout(timer)
  }, [settings.format, settings.quality, settings.lossless])

  // Optimise looks at the selection, or the page when nothing is selected.
  useEffect(() => {
    if (tab !== 'optimise') return
    setScan(null)
    setReport(null)
    send({ type: 'scan' })
  }, [tab, layers])

  const names = useMemo(
    () =>
      uniqueNames(
        outputs.map((o) =>
          fileName(
            settings.pattern,
            o.layer,
            o.size,
            o.result ?? { width: 0, height: 0 },
            settings.format,
          ),
        ),
      ),
    [outputs, settings.pattern, settings.format],
  )
  const done = outputs.filter((o) => o.result)
  const pending = outputs.filter((o) => !o.result && !o.error).length
  const totalAfter = done.reduce((sum, o) => sum + o.result!.bytes.length, 0)
  const totalBefore = done.reduce((sum, o) => sum + o.png!.length, 0)

  const runExport = () => {
    const files = outputs
      .map((o, i) => ({ name: names[i]!, output: o }))
      .filter(({ output }) => output.result)
    if (!files.length) return
    const zip = settings.zip && files.length > 1
    if (zip) {
      const archive = zipSync(
        Object.fromEntries(files.map(({ name, output }) => [name, output.result!.bytes])),
        { level: 0 },
      )
      download(zipName(files.map(({ output }) => output.layer.name)), archive, 'application/zip')
    } else {
      // Folders exist only inside a ZIP: a loose file keeps its whole path in its name.
      files.forEach(({ name, output }, i) =>
        setTimeout(
          () => download(name.replaceAll('/', '-'), output.result!.bytes, MIME[settings.format]),
          i * 200,
        ),
      )
    }
    send({
      type: 'notify',
      message: `Exported ${files.length} ${files.length === 1 ? 'file' : 'files'} · ${formatBytes(totalAfter)}`,
    })
  }

  const runOptimise = async () => {
    if (!scan) return
    const swaps: { hash: string; bytes: Uint8Array }[] = []
    let before = 0
    let after = 0
    for (const [i, image] of scan.images.entries()) {
      setWork({
        label: `Compressing ${i + 1} of ${scan.images.length}`,
        progress: i / scan.images.length,
      })
      try {
        const result = await encoder.encode({
          bytes: image.bytes,
          format: 'figma',
          quality: settings.quality,
          lossless: false,
          maxWidth: Math.min(FIGMA_MAX, image.shownWidth * SHOWN_DENSITY),
          maxHeight: Math.min(FIGMA_MAX, image.shownHeight * SHOWN_DENSITY),
        })
        // Only a smaller file replaces the original.
        if (result.bytes.length < image.bytes.length) {
          swaps.push({ hash: image.hash, bytes: result.bytes })
          before += image.bytes.length
          after += result.bytes.length
        }
      } catch {
        // An image the browser cannot decode stays as it is.
      }
    }
    setWork(null)
    if (swaps.length) send({ type: 'replace', images: swaps })
    const kept = scan.images.length - swaps.length
    setReport(
      swaps.length
        ? {
            tone: 'success',
            text: `Saved ${formatBytes(before - after)} across ${swaps.length} ${swaps.length === 1 ? 'image' : 'images'}${kept ? `; ${kept} already as small as ${kept === 1 ? 'it gets' : 'they get'}` : ''}. Undo with ⌘Z or Ctrl Z.`,
          }
        : { tone: 'info', text: 'Every image is already as small as it gets.' },
    )
    send({ type: 'scan' })
  }

  const runImport = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (!images.length) return
    setTab('import')
    setReport(null)
    const ready: { name: string; bytes: Uint8Array; width: number; height: number }[] = []
    let before = 0
    let after = 0
    for (const [i, file] of images.entries()) {
      setWork({ label: `Compressing ${i + 1} of ${images.length}`, progress: i / images.length })
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const result = await encoder.encode({
          bytes,
          format: 'figma',
          quality: settings.quality,
          lossless: false,
          maxWidth: FIGMA_MAX,
          maxHeight: FIGMA_MAX,
        })
        // A PNG or JPG that was already smaller goes in as it was, if Figma can hold it.
        const keep =
          bytes.length <= result.bytes.length && /^image\/(png|jpeg|gif)$/.test(file.type)
        const name = file.name.replace(/\.[^.]+$/, '')
        ready.push({
          name,
          bytes: keep ? bytes : result.bytes,
          width: result.width,
          height: result.height,
        })
        before += bytes.length
        after += keep ? bytes.length : result.bytes.length
      } catch {
        setReport({
          tone: 'error',
          text: `${file.name} could not be read. Try PNG, JPG, WebP or AVIF.`,
        })
      }
    }
    if (!ready.length) return setWork(null)
    setWork({ label: 'Placing in Figma', progress: 1 })
    send({ type: 'place', images: ready, fill: fill && fillable > 0 })
    if (before > after)
      send({
        type: 'notify',
        message: `Imported ${ready.length} · ${formatBytes(after)}, ${saving(before, after)}`,
      })
  }

  const feedbackUrl = `${REPO_URL}/issues/new?template=feature.yml&version=${version}`

  return (
    <div
      class="app"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => e.relatedTarget === null && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void runImport([...(e.dataTransfer?.files ?? [])])
      }}
    >
      <header class="ir-header">
        <Logo height={15} />
        <div class="ir-header__actions">
          <IconButton icon="feedback" label="Send feedback" onClick={() => openUrl(feedbackUrl)} />
          <IconButton icon="help" label="Help" onClick={() => openUrl(`${REPO_URL}#readme`)} />
        </div>
      </header>
      <Tabs
        value={tab}
        onChange={(next) => {
          setReport(null)
          setTab(next)
        }}
        options={TABS}
      />

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
        multiple
        hidden
        onChange={(e) => {
          void runImport([...(e.currentTarget.files ?? [])])
          e.currentTarget.value = ''
        }}
      />

      <main class="scroll">
        {tab === 'export' &&
          (outputs.length ? (
            <ExportView
              outputs={outputs}
              names={names}
              focus={focus}
              onFocus={setFocus}
              settings={settings}
              onChange={save}
              totals={{ before: totalBefore, after: totalAfter, pending }}
            />
          ) : (
            <Intro
              title="Select layers to export"
              text="Select frames, groups or images on the canvas. Each file's size shows here before you save it."
              facts={[
                'WebP, AVIF, JPG and PNG, encoded on your computer',
                'Any size from 0.5× to 4×, or an exact width',
                'Separate files or one ZIP, named your way',
              ]}
            />
          ))}

        {tab === 'optimise' &&
          (scan === null ? (
            <p class="working">
              <span class="ir-spinner" /> Looking for images
            </p>
          ) : scan.images.length ? (
            <OptimiseView scan={scan} />
          ) : (
            <Intro
              title="No images here"
              text={
                scan.scope === 'selection'
                  ? 'The selected layers have no image fills. Select other layers, or nothing to check the whole page.'
                  : 'This page has no image fills to compress.'
              }
            />
          ))}

        {tab === 'import' && (
          <Intro
            title="Bring images in, already light"
            text="Drop or choose PNG, JPG, GIF, WebP or AVIF files. Each is compressed before it lands, and shrunk to fit Figma's 4096 px limit."
            action={
              <Button icon="upload" onClick={() => fileInput.current?.click()}>
                Choose images
              </Button>
            }
          >
            {fillable > 0 && (
              <Toggle
                checked={fill}
                onChange={setFill}
                label="Fill the selected layers"
                hint={`Uses the first image as the fill of ${fillable} selected ${fillable === 1 ? 'layer' : 'layers'}.`}
              />
            )}
          </Intro>
        )}

        {report && (
          <Section>
            <Message tone={report.tone} onDismiss={() => setReport(null)}>
              {report.text}
            </Message>
          </Section>
        )}

        <p class="credit">
          Free and open source. Built by{' '}
          <a
            href={CREDIT.url}
            onClick={(e) => {
              e.preventDefault()
              openUrl(CREDIT.url)
            }}
          >
            {CREDIT.company}
          </a>
          . Your images never leave this computer.{version && <span class="num"> v{version}</span>}
        </p>
      </main>

      {work ? (
        <footer class="dock dock--work">
          <Progress value={work.progress} />
          <p class="working">
            <span class="ir-spinner" /> {work.label}
          </p>
        </footer>
      ) : tab === 'export' && outputs.length ? (
        <footer class="dock">
          <Button variant="primary" size="lg" block disabled={!done.length} onClick={runExport}>
            {pending
              ? `Encoding ${outputs.length - pending} of ${outputs.length}`
              : done.length === 1
                ? `Download ${names[outputs.indexOf(done[0]!)]!.split('/').pop()} · ${formatBytes(totalAfter)}`
                : settings.zip
                  ? `Download ZIP of ${done.length} · ${formatBytes(totalAfter)}`
                  : `Download ${done.length} files · ${formatBytes(totalAfter)}`}
          </Button>
        </footer>
      ) : tab === 'optimise' && scan?.images.length ? (
        <footer class="dock">
          <Button variant="primary" size="lg" block onClick={() => void runOptimise()}>
            Compress {scan.images.length} {scan.images.length === 1 ? 'image' : 'images'}
          </Button>
        </footer>
      ) : null}

      {dragging && (
        <div class="drop" aria-hidden="true">
          Drop images to compress and place them
        </div>
      )}
    </div>
  )
}

function Intro({
  title,
  text,
  facts,
  action,
  children,
}: {
  title: string
  text: string
  facts?: string[]
  action?: ComponentChildren
  children?: ComponentChildren
}) {
  return (
    <>
      <div class="intro">
        <h1>{title}</h1>
        <p>{text}</p>
        {action}
      </div>
      {children && <Section>{children}</Section>}
      {facts && (
        <Section title="What it does">
          <ul class="facts">
            {facts.map((fact) => (
              <li>{fact}</li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

function ExportView({
  outputs,
  names,
  focus,
  onFocus,
  settings,
  onChange,
  totals,
}: {
  outputs: Output[]
  names: string[]
  focus: string
  onFocus: (key: string) => void
  settings: Settings
  onChange: (next: Partial<Settings> | ((current: Settings) => Partial<Settings>)) => void
  totals: { before: number; after: number; pending: number }
}) {
  const focused = outputs.find((o) => o.key === focus) ?? outputs[0]
  const lossy = settings.format !== 'png' && !(settings.lossless && settings.format !== 'jpeg')
  const [width, setWidth] = useState(settings.width ? String(settings.width) : '')

  return (
    <>
      <Preview output={focused} format={settings.format} />

      <Section
        title="Files"
        aside={
          <span class="num">
            {outputs.length} · {formatBytes(totals.after)}
            {totals.before > 0 && !totals.pending && ` · ${saving(totals.before, totals.after)}`}
          </span>
        }
      >
        <ul class="files">
          {outputs.map((o, i) => (
            <li>
              <button
                type="button"
                class="file"
                aria-pressed={o.key === focused?.key}
                onClick={() => onFocus(o.key)}
                title={o.result ? `${o.result.width} × ${o.result.height} px` : undefined}
              >
                <span class="truncate">{names[i]}</span>
                {o.error ? (
                  <span class="file__error">Failed</span>
                ) : o.result ? (
                  <span class="num">
                    {formatBytes(o.result.bytes.length)}{' '}
                    <span class={o.result.bytes.length > o.png!.length ? 'file__larger' : 'muted'}>
                      {saving(o.png!.length, o.result.bytes.length)}
                    </span>
                  </span>
                ) : (
                  <span class="ir-spinner muted" aria-label="Encoding" />
                )}
              </button>
            </li>
          ))}
        </ul>
        {outputs.some((o) => o.error) && (
          <Message tone="warning">{outputs.find((o) => o.error)!.error}</Message>
        )}
      </Section>

      <Section title="Format">
        <Segmented
          label="Format"
          value={settings.format}
          options={FORMATS}
          onChange={(format) => onChange({ format })}
        />
        {lossy && (
          <label class="ir-prop">
            <span>Quality</span>
            <span class="range">
              <input
                type="range"
                min={1}
                max={100}
                value={settings.quality}
                onInput={(e) => onChange({ quality: Number(e.currentTarget.value) })}
              />
              <output class="num">{settings.quality}</output>
            </span>
          </label>
        )}
        {(settings.format === 'webp' || settings.format === 'avif') && (
          <Toggle
            checked={settings.lossless}
            onChange={(lossless) => onChange({ lossless })}
            label="Lossless"
            hint="Every pixel kept exactly. Larger files."
          />
        )}
        {settings.format === 'png' && (
          <p class="hint">PNG stays lossless and is never larger than Figma's own export.</p>
        )}
      </Section>

      <Section title="Size">
        <Segmented
          label="Scales"
          value={settings.scales}
          options={SCALES.map((value) => ({ value, label: `${value}×` }))}
          onChange={(scale) =>
            onChange((current) => {
              const scales = current.scales.includes(scale)
                ? current.scales.filter((s) => s !== scale)
                : [...current.scales, scale].sort((a, b) => a - b)
              // Keep at least one size.
              return scales.length || current.width ? { scales } : {}
            })
          }
        />
        <label class="ir-prop">
          <span>Width</span>
          <input
            class="ir-input num"
            type="number"
            min={1}
            max={16384}
            placeholder="Exact width in px, optional"
            value={width}
            onInput={(e) => setWidth(e.currentTarget.value)}
            onChange={(e) => {
              const value = Math.round(Number(e.currentTarget.value))
              const next = value > 0 ? Math.min(value, 16384) : null
              if (next || settings.scales.length) onChange({ width: next })
              setWidth(next ? String(next) : '')
            }}
          />
        </label>
      </Section>

      <Section title="Output">
        <label class="ir-prop">
          <span>Name</span>
          <input
            class="ir-input"
            value={settings.pattern}
            spellcheck={false}
            onChange={(e) =>
              onChange({ pattern: e.currentTarget.value || DEFAULT_SETTINGS.pattern })
            }
          />
        </label>
        <p class="hint">
          {'{name}'} the layer, {'{@size}'} @2x except at 1×, {'{size}'}, {'{width}'}, {'{height}'}.
          A slash makes a folder in the ZIP.
        </p>
        {outputs.length > 1 && (
          <div class="ir-prop">
            <span>Save as</span>
            <Segmented
              label="Save as"
              value={settings.zip ? 'zip' : 'files'}
              options={[
                { value: 'zip', label: 'One ZIP' },
                { value: 'files', label: 'Separate files' },
              ]}
              onChange={(value) => onChange({ zip: value === 'zip' })}
            />
          </div>
        )}
      </Section>
    </>
  )
}

/** The chosen file on the stage, whole or at 100%. Hold Compare to see Figma's original. */
function Preview({ output, format }: { output?: Output; format: Format }) {
  const [original, setOriginal] = useState(false)
  const [zoom, setZoom] = useState<'fit' | 'actual'>('fit')
  const bytes = original ? output?.png : output?.result?.bytes
  const url = useMemo(
    () =>
      bytes
        ? URL.createObjectURL(
            new Blob([bytes as BlobPart], { type: original ? 'image/png' : MIME[format] }),
          )
        : '',
    [bytes],
  )
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  const hold = (on: boolean) => () => setOriginal(on)
  return (
    <>
      <div class={`preview preview--${zoom}`}>
        {url ? <img src={url} alt="" /> : <span class="ir-spinner muted" />}
      </div>
      <div class="preview-bar">
        <span class="muted num truncate">
          {original ? 'Original' : 'Result'}
          {output?.result && ` · ${output.result.width} × ${output.result.height}`}
        </span>
        <Segmented
          label="Zoom"
          value={zoom}
          options={[
            { value: 'fit', label: 'Fit' },
            { value: 'actual', label: '100%' },
          ]}
          onChange={setZoom}
        />
        <button
          type="button"
          class="text-button"
          disabled={!output?.result}
          onPointerDown={hold(true)}
          onPointerUp={hold(false)}
          onPointerLeave={hold(false)}
          onKeyDown={(e) => e.key === ' ' && setOriginal(true)}
          onKeyUp={hold(false)}
        >
          Compare
        </button>
      </div>
    </>
  )
}

function OptimiseView({ scan }: { scan: { images: PlacedImage[]; scope: 'selection' | 'page' } }) {
  const total = scan.images.reduce((sum, image) => sum + image.bytes.length, 0)
  return (
    <>
      <div class="intro">
        <h1>Make this file lighter</h1>
        <p>
          Each image is shrunk to twice the largest size it is shown at, then compressed. Images
          that would not get smaller stay as they are.
        </p>
      </div>
      <Section
        title={scan.scope === 'selection' ? 'Images in the selection' : 'Images on this page'}
        aside={
          <span class="num">
            {scan.images.length} · {formatBytes(total)}
          </span>
        }
      >
        <ul class="files">
          {scan.images.map((image) => {
            const shrinks =
              image.width > image.shownWidth * SHOWN_DENSITY ||
              image.height > image.shownHeight * SHOWN_DENSITY
            return (
              <li class="file" title={`Shown at most ${image.shownWidth} × ${image.shownHeight}`}>
                <span class="truncate">
                  {image.name}
                  {image.uses > 1 && <span class="muted"> ×{image.uses}</span>}
                </span>
                <span class="num">
                  <span class={shrinks ? 'file__larger' : 'muted'}>
                    {image.width} × {image.height}
                  </span>{' '}
                  {formatBytes(image.bytes.length)}
                </span>
              </li>
            )
          })}
        </ul>
      </Section>
      <Section>
        <p class="hint">Sizes in red are larger than any layer shows them.</p>
      </Section>
    </>
  )
}
