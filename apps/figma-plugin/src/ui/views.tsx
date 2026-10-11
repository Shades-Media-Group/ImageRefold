/**
 * The panel's screens. One rule runs through all of them: one control per row,
 * a label on the left, three type sizes (meta 11, body 12, figure 20), and the
 * main action alone in the dock at the bottom.
 */
import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { CREDIT, Icon, REPO_URL, Segmented, Toggle } from './kit'
import {
  DEFAULT_SETTINGS,
  PRESET_SCALES,
  type Format,
  type PlacedImage,
  type Settings,
  type Theme,
} from '../shared/messages'
import { formatBytes, formatSizes, parseSizes, saving } from '../shared/naming'
import { MIME, openUrl, SHOWN_DENSITY, type Output } from './bridge'

type Change = (next: Partial<Settings> | ((current: Settings) => Partial<Settings>)) => void

const FORMATS: { value: Format; label: string }[] = [
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'jpeg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
]

/** A title row in place of the tabs, with a way back. */
export function TitleBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div class="ir-tabs ir-tabs--title">
      <button type="button" onClick={onBack} aria-label={`Back from ${title}`}>
        <Icon name="chevronRight" size={16} class="flip" />
        {title}
      </button>
    </div>
  )
}

/** A label on the left, one control on the right. */
function Row({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="row">
      <span class="row__label">{label}</span>
      <div class="row__control">{children}</div>
    </div>
  )
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div class="empty">
      <p class="empty__title">{title}</p>
      <p class="meta">{text}</p>
    </div>
  )
}

export function ExportView({
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
  onChange: Change
  totals: { before: number; after: number; pending: number }
}) {
  if (!outputs.length)
    return (
      <Empty
        title="Select a frame, group or image"
        text="Its size in every format shows here before you download."
      />
    )
  const focused = outputs.find((o) => o.key === focus) ?? outputs[0]!
  const lossless = settings.lossless && (settings.format === 'webp' || settings.format === 'avif')
  const ready = !totals.pending && totals.after > 0

  return (
    <>
      <Preview output={focused} format={settings.format} />

      <div class="figure" aria-live="polite">
        <span class="figure__value num">{ready ? formatBytes(totals.after) : '—'}</span>
        <span class="meta num">
          {ready
            ? `${saving(totals.before, totals.after)} vs PNG ${formatBytes(totals.before)}`
            : totals.pending
              ? 'Encoding…'
              : 'No file'}
        </span>
      </div>

      <div class="rows">
        <Row label="Format">
          <Segmented
            label="Format"
            value={settings.format}
            options={FORMATS}
            onChange={(format) => onChange({ format })}
          />
        </Row>
        <Row label="Quality">
          {settings.format === 'png' || lossless ? (
            <span class="meta">Lossless</span>
          ) : (
            <span class="range">
              <input
                type="range"
                min={1}
                max={100}
                value={settings.quality}
                aria-label="Quality"
                onInput={(e) => onChange({ quality: Number(e.currentTarget.value) })}
              />
              <output class="num">{settings.quality}</output>
            </span>
          )}
        </Row>
        <Row label="Size">
          <Sizes settings={settings} onChange={onChange} />
        </Row>
      </div>

      {outputs.length > 1 && (
        <ul class="files" aria-label="Files">
          {outputs.map((o, i) => (
            <li>
              <button
                type="button"
                class="file"
                aria-pressed={o.key === focused.key}
                onClick={() => onFocus(o.key)}
                title={o.result ? `${o.result.width} × ${o.result.height} px` : undefined}
              >
                <span class="truncate">{names[i]}</span>
                {o.error ? (
                  <span class="file__error">Failed</span>
                ) : o.result ? (
                  <span class="num file__size">{formatBytes(o.result.bytes.length)}</span>
                ) : (
                  <span class="ir-spinner muted" aria-label="Encoding" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {outputs.some((o) => o.error) && (
        <p class="note note--error">{outputs.find((o) => o.error)!.error}</p>
      )}
    </>
  )
}

/** 1×, 2×, 3× as one-click chips; anything else typed in, like "0.5x, 1200". */
function Sizes({ settings, onChange }: { settings: Settings; onChange: Change }) {
  const extraScales = settings.scales.filter((s) => !PRESET_SCALES.includes(s))
  const typed = formatSizes(extraScales, settings.widths)
  const [text, setText] = useState(typed)
  useEffect(() => setText(typed), [typed])
  const commit = (value: string) => {
    const { scales, widths } = parseSizes(value)
    onChange((current) => {
      const presets = current.scales.filter((s) => PRESET_SCALES.includes(s))
      const all = [...new Set([...presets, ...scales])].sort((a, b) => a - b)
      // Keep at least one size.
      return all.length || widths.length ? { scales: all, widths } : {}
    })
    setText(formatSizes(scales, widths))
  }
  return (
    <div class="sizes">
      {PRESET_SCALES.map((scale) => (
        <button
          type="button"
          class="chip"
          aria-pressed={settings.scales.includes(scale)}
          onClick={() =>
            onChange((current) => {
              const scales = current.scales.includes(scale)
                ? current.scales.filter((s) => s !== scale)
                : [...current.scales, scale].sort((a, b) => a - b)
              return scales.length || current.widths.length ? { scales } : {}
            })
          }
        >
          {scale}×
        </button>
      ))}
      <input
        class="chip chip--input num"
        value={text}
        placeholder="0.5x, 1200"
        aria-label="Other sizes: scales like 0.5x or widths in pixels like 1200"
        spellcheck={false}
        onInput={(e) => setText(e.currentTarget.value)}
        onChange={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit(e.currentTarget.value)}
      />
    </div>
  )
}

/** The chosen file, whole, on the stage. Press and hold to see Figma's original. */
function Preview({ output, format }: { output: Output; format: Format }) {
  const [original, setOriginal] = useState(false)
  const bytes = original ? output.png : output.result?.bytes
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
  const hold = (on: boolean) => () => output.result && setOriginal(on)
  return (
    <div
      class="stage"
      onPointerDown={hold(true)}
      onPointerUp={hold(false)}
      onPointerLeave={hold(false)}
      title={output.result ? 'Hold to see the original' : undefined}
    >
      {url ? (
        <img src={url} alt="" draggable={false} />
      ) : output.error ? (
        <p class="meta">No preview for this file</p>
      ) : (
        <span class="ir-spinner muted" />
      )}
      {output.result && (
        <span class="stage__tag num">
          {original ? 'Original PNG' : `${output.result.width} × ${output.result.height}`}
        </span>
      )}
    </div>
  )
}

export function OptimiseView({
  scan,
}: {
  scan: { images: PlacedImage[]; scope: 'selection' | 'page' } | null
}) {
  if (!scan)
    return (
      <p class="working">
        <span class="ir-spinner" /> Looking for images
      </p>
    )
  if (!scan.images.length)
    return (
      <Empty
        title="No images here"
        text={
          scan.scope === 'selection'
            ? 'Select layers with image fills, or nothing to check the whole page.'
            : 'This page has no image fills.'
        }
      />
    )
  const total = scan.images.reduce((sum, image) => sum + image.bytes.length, 0)
  return (
    <>
      <div class="figure">
        <span class="figure__value num">{formatBytes(total)}</span>
        <span class="meta">
          in {scan.images.length} {scan.images.length === 1 ? 'image' : 'images'}{' '}
          {scan.scope === 'selection' ? 'in the selection' : 'on this page'}
        </span>
      </div>
      <ul class="files files--static">
        {scan.images.map((image) => {
          const oversized =
            image.width > image.shownWidth * SHOWN_DENSITY ||
            image.height > image.shownHeight * SHOWN_DENSITY
          return (
            <li class="file" title={`Shown at most ${image.shownWidth} × ${image.shownHeight}`}>
              <span class="truncate">
                {image.name}
                {image.uses > 1 && <span class="meta"> ×{image.uses}</span>}
              </span>
              <span class={`num file__dims${oversized ? ' file__dims--over' : ''}`}>
                {image.width} × {image.height}
              </span>
              <span class="num file__size">{formatBytes(image.bytes.length)}</span>
            </li>
          )
        })}
      </ul>
      <p class="note">
        Images are shrunk to twice the size they're shown at, then compressed. Red sizes are larger
        than needed.
      </p>
    </>
  )
}

export function ImportView({
  fillable,
  fill,
  onFill,
  onChoose,
}: {
  fillable: number
  fill: boolean
  onFill: (fill: boolean) => void
  onChoose: () => void
}) {
  return (
    <>
      <button type="button" class="dropzone" onClick={onChoose}>
        <Icon name="upload" size={20} />
        <span class="dropzone__title">Drop images or choose files</span>
        <span class="meta">PNG, JPG, GIF, WebP or AVIF · compressed and fitted to 4096 px</span>
      </button>
      {fillable > 0 && (
        <div class="rows">
          <Toggle
            checked={fill}
            onChange={onFill}
            label={`Fill the ${fillable} selected ${fillable === 1 ? 'layer' : 'layers'}`}
          />
        </div>
      )}
    </>
  )
}

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Automatic' },
]

export function SettingsView({
  settings,
  version,
  onChange,
  onReset,
}: {
  settings: Settings
  version: string
  onChange: Change
  onReset: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const changed = JSON.stringify(settings) !== JSON.stringify(DEFAULT_SETTINGS)
  return (
    <>
      <div class="rows">
        <Row label="Theme">
          <Segmented
            label="Theme"
            value={settings.theme}
            options={THEMES}
            onChange={(theme) => onChange({ theme })}
          />
        </Row>
        <Row label="Names">
          <input
            class="ir-input"
            value={settings.pattern}
            spellcheck={false}
            aria-label="File name pattern"
            onChange={(e) =>
              onChange({ pattern: e.currentTarget.value.trim() || DEFAULT_SETTINGS.pattern })
            }
          />
        </Row>
        <p class="note note--row">
          {'{name}'} layer name · {'{@size}'} @2x, blank at 1× · {'{width}'} · {'{height}'}
        </p>
        <Row label="Many">
          <Segmented
            label="Several files"
            value={settings.zip ? 'zip' : 'files'}
            options={[
              { value: 'zip', label: 'One ZIP' },
              { value: 'files', label: 'Separate files' },
            ]}
            onChange={(value) => onChange({ zip: value === 'zip' })}
          />
        </Row>
        <Toggle
          checked={settings.lossless}
          onChange={(lossless) => onChange({ lossless })}
          label="Lossless WebP and AVIF"
          hint="Every pixel kept. Larger files."
        />
      </div>

      <div class="rows">
        <p class="meta">Your choices are saved on this computer and used next time.</p>
        <button
          type="button"
          class="text-button text-button--danger"
          disabled={!changed}
          onClick={() => {
            if (!confirming) return setConfirming(true)
            onReset()
            setConfirming(false)
          }}
          onBlur={() => setConfirming(false)}
        >
          {confirming ? 'Click again to reset everything' : 'Reset all preferences'}
        </button>
      </div>

      <div class="about">
        <p>
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
          . Your images never leave this computer.
        </p>
        <p class="about__links">
          <button
            type="button"
            class="text-button"
            onClick={() =>
              openUrl(`${REPO_URL}/issues/new?template=feature.yml&version=${version}`)
            }
          >
            Send feedback
          </button>
          <button type="button" class="text-button" onClick={() => openUrl(REPO_URL)}>
            Source code
          </button>
          {version && <span class="meta num">v{version}</span>}
        </p>
      </div>
    </>
  )
}
