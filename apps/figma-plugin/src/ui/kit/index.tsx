/**
 * The panel controls ImageRefold shares with PageRecast: the same tokens,
 * the same inspector grammar, so the two plugins read as one family.
 */
import type { ComponentChildren, JSX } from 'preact'
import { icons, type IconName } from './icons'
import { MARK, WORDMARK } from './brand'
import './tokens.css'
import './components.css'

export type { IconName }

export const CREDIT = { company: 'Shades Media Group', url: 'https://shades.md' }
export const REPO_URL = 'https://github.com/Shades-Media-Group/ImageRefold'

export function Icon({
  name,
  size = 16,
  class: className = '',
}: {
  name: IconName
  size?: number
  class?: string
}) {
  return (
    <svg
      class={`ir-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icons[name] }}
    />
  )
}

const MARK_FILLS = ['var(--mark-red)', 'var(--rose)', 'var(--ink)']
const markPaths = () => MARK.map((d, i) => <path fill={MARK_FILLS[i]} d={d} />)

/** Mark plus outlined wordmark, the primary logo. */
export function Logo({ height = 16 }: { height?: number }) {
  const markSize = WORDMARK.capHeight * 1.9
  const gap = markSize * 0.3
  const width = markSize + gap + WORDMARK.width
  const scale = markSize / 96
  return (
    <svg
      class="ir-logo"
      height={height}
      width={(height * width) / markSize}
      viewBox={`0 0 ${width} ${markSize}`}
      role="img"
      aria-label="ImageRefold"
    >
      <g transform={`scale(${scale})`}>{markPaths()}</g>
      <path
        fill="currentColor"
        transform={`translate(${markSize + gap} ${markSize / 2 + WORDMARK.capHeight / 2})`}
        d={WORDMARK.d}
      />
    </svg>
  )
}

type ButtonProps = JSX.HTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'md' | 'lg'
  block?: boolean
  icon?: IconName
  disabled?: boolean
  type?: 'button' | 'submit'
}

export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  icon,
  children,
  class: className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'ir-button',
    `ir-button--${variant}`,
    size === 'lg' && 'ir-button--lg',
    block && 'ir-button--block',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type={type} class={classes} {...rest}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  )
}

export function IconButton({
  icon,
  label,
  ...rest
}: JSX.HTMLAttributes<HTMLButtonElement> & {
  icon: IconName
  label: string
  disabled?: boolean
}) {
  return (
    <button type="button" class="ir-icon-button" aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={16} />
    </button>
  )
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div class="ir-tabs" role="tablist">
      {options.map((o) => (
        <button
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** One choice, or several when `multiple` (the sizes to export). */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T | T[]
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
}) {
  const on = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v)
  return (
    <div class="ir-segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" aria-pressed={on(o.value)} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label class="ir-toggle">
      <span>
        <span class="ir-toggle__label">{label}</span>
        {hint && <span class="ir-toggle__hint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    </label>
  )
}

export function Section({
  title,
  aside,
  children,
}: {
  title?: string
  aside?: ComponentChildren
  children: ComponentChildren
}) {
  return (
    <section class={title ? 'ir-section' : 'ir-section ir-section--bare'}>
      {title && (
        <div class="ir-section-head">
          <h2>{title}</h2>
          {aside && <span>{aside}</span>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Message({
  tone = 'info',
  children,
  onDismiss,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success'
  children: ComponentChildren
  onDismiss?: () => void
}) {
  const icon: IconName =
    tone === 'warning'
      ? 'warning'
      : tone === 'error'
        ? 'error'
        : tone === 'success'
          ? 'check'
          : 'info'
  return (
    <div class={`ir-message ir-message--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={icon} size={16} />
      <div>{children}</div>
      {onDismiss ? <IconButton icon="close" label="Dismiss" onClick={onDismiss} /> : <span />}
    </div>
  )
}

export function Progress({ value }: { value: number }) {
  return (
    <div
      class="ir-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div style={{ transform: `scaleX(${Math.max(0.02, Math.min(1, value))})` }} />
    </div>
  )
}
