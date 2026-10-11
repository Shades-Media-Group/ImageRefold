import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { zipSync } from 'fflate'
import { Button, Icon, IconButton, Logo, Message, Progress, REPO_URL, Tabs } from './kit'
import {
  DEFAULT_SETTINGS,
  type Layer,
  type MainToUi,
  type PlacedImage,
  type Settings,
  type Size,
} from '../shared/messages'
import { fileName, formatBytes, saving, sizeToken, uniqueNames, zipName } from '../shared/naming'
import { Encoder } from './encoding'
import { MIME, openUrl, send, SHOWN_DENSITY, type Output } from './bridge'
import { ExportView, ImportView, OptimiseView, SettingsView, TitleBar } from './views'

type Tab = 'export' | 'optimise' | 'import'

const TABS: { value: Tab; label: string }[] = [
  { value: 'export', label: 'Export' },
  { value: 'optimise', label: 'Optimise' },
  { value: 'import', label: 'Import' },
]

/** Figma holds images up to 4096 px on a side. */
const FIGMA_MAX = 4096
const encoder = new Encoder()

function download(name: string, bytes: Uint8Array, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const sizesOf = (settings: Settings): Size[] => [
  ...settings.scales.map((value): Size => ({ kind: 'scale', value })),
  ...settings.widths.map((value): Size => ({ kind: 'width', value })),
]

type Report = { tone: 'success' | 'info' | 'error'; text: string }

export function App() {
  const [tab, setTab] = useState<Tab>('export')
  const [view, setView] = useState<'main' | 'settings'>('main')
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
  const [report, setReport] = useState<Report | null>(null)
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

  // The theme: light unless chosen otherwise; 'auto' follows the class Figma puts on <html>.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

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
      const message = error instanceof Error ? error.message : String(error)
      // A job the reset dropped is encoded again with the new settings.
      if (run !== encodeRun.current || message === 'cancelled') return
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
          settingsRef.current = message.settings
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
  const sizes = useMemo(() => sizesOf(settings), [settings.scales, settings.widths])
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
      // Stop work for the old settings, clear, then encode every PNG received so far;
      // any arriving later is encoded as it lands.
      encoder.reset()
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
    if (tab !== 'optimise' || view !== 'main') return
    setScan(null)
    setReport(null)
    send({ type: 'scan' })
  }, [tab, layers, view])

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
    if (settings.zip && files.length > 1) {
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
    setView('main')
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

  const exportLabel = pending
    ? `Encoding ${outputs.length - pending} of ${outputs.length}`
    : !done.length
      ? 'Nothing to export'
      : done.length === 1
        ? `Download ${names[outputs.indexOf(done[0]!)]!.split('/').pop()}`
        : settings.zip
          ? `Download ${done.length} files as ZIP`
          : `Download ${done.length} files`

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
          <IconButton icon="help" label="Help" onClick={() => openUrl(`${REPO_URL}#readme`)} />
          <IconButton
            icon="settings"
            label="Settings"
            aria-pressed={view === 'settings'}
            onClick={() => setView(view === 'settings' ? 'main' : 'settings')}
          />
        </div>
      </header>

      {view === 'settings' ? (
        <>
          <TitleBar title="Settings" onBack={() => setView('main')} />
          <main class="scroll">
            <SettingsView
              settings={settings}
              version={version}
              onChange={save}
              onReset={() => {
                settingsRef.current = DEFAULT_SETTINGS
                setSettings(DEFAULT_SETTINGS)
                send({ type: 'settings', settings: DEFAULT_SETTINGS })
              }}
            />
          </main>
        </>
      ) : (
        <>
          <Tabs
            value={tab}
            onChange={(next) => {
              setReport(null)
              setTab(next)
            }}
            options={TABS}
          />

          <main class="scroll">
            {tab === 'export' && (
              <ExportView
                outputs={outputs}
                names={names}
                focus={focus}
                onFocus={setFocus}
                settings={settings}
                onChange={save}
                totals={{ before: totalBefore, after: totalAfter, pending }}
              />
            )}
            {tab === 'optimise' && <OptimiseView scan={scan} />}
            {tab === 'import' && (
              <ImportView
                fillable={fillable}
                fill={fill}
                onFill={setFill}
                onChoose={() => fileInput.current?.click()}
              />
            )}
            {report && (
              <div class="report">
                <Message tone={report.tone} onDismiss={() => setReport(null)}>
                  {report.text}
                </Message>
              </div>
            )}
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
                <span class="truncate">{exportLabel}</span>
                {done.length > 0 && !pending && (
                  <span class="dock__size num">{formatBytes(totalAfter)}</span>
                )}
              </Button>
            </footer>
          ) : tab === 'optimise' && scan?.images.length ? (
            <footer class="dock">
              <Button variant="primary" size="lg" block onClick={() => void runOptimise()}>
                Compress {scan.images.length} {scan.images.length === 1 ? 'image' : 'images'}
              </Button>
            </footer>
          ) : null}
        </>
      )}

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

      {dragging && (
        <div class="drop" aria-hidden="true">
          <Icon name="upload" size={20} />
          Drop to compress and place
        </div>
      )}
    </div>
  )
}
