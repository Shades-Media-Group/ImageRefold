import {
  DEFAULT_SETTINGS,
  type Layer,
  type MainToUi,
  type PlacedImage,
  type Settings,
  type Size,
  type UiToMain,
} from '../shared/messages'

declare const __VERSION__: string

const SETTINGS_KEY = 'settings'
const send = (message: MainToUi) => figma.ui.postMessage(message)

figma.showUI(__html__, { width: 400, height: 640, themeColors: true, title: 'ImageRefold' })

const layersOf = (nodes: readonly SceneNode[]): Layer[] =>
  nodes
    .filter((node) => 'exportAsync' in node && node.width > 0 && node.height > 0)
    .map((node) => ({ id: node.id, name: node.name, width: node.width, height: node.height }))

const fillableOf = (nodes: readonly SceneNode[]) =>
  nodes.filter((node): node is SceneNode & GeometryMixin => 'fills' in node)

const sendSelection = () => {
  const selection = figma.currentPage.selection
  send({ type: 'selection', layers: layersOf(selection), fillable: fillableOf(selection).length })
}

/** The most the window can encode; it says why when a size is over. Matches encode.worker.ts. */
const MAX_PIXELS = 64_000_000

async function render(job: number, ids: string[], sizes: Size[]) {
  for (const id of ids) {
    const node = await figma.getNodeByIdAsync(id)
    if (!node || !('exportAsync' in node) || node.type === 'PAGE') continue
    for (const size of sizes) {
      const scale = size.kind === 'scale' ? size.value : size.value / node.width
      const width = Math.round(node.width * scale)
      const height = Math.round(node.height * scale)
      if (width * height > MAX_PIXELS) {
        // Rendering this would take Figma a long time for a file the window must refuse.
        const megapixels = Math.round((width * height) / 1_000_000)
        send({
          type: 'render-error',
          job,
          id,
          size,
          message: `This export is about ${width} × ${height} px (${megapixels} megapixels); ImageRefold works up to 64. Choose a smaller size or an exact width.`,
        })
        continue
      }
      try {
        // Figma's lossless PNG is the source; the window encodes it into the chosen format.
        const png = await node.exportAsync({
          format: 'PNG',
          constraint:
            size.kind === 'scale'
              ? { type: 'SCALE', value: size.value }
              : { type: 'WIDTH', value: size.value },
        })
        send({ type: 'rendered', job, id, size, png })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        send({ type: 'render-error', job, id, size, message })
      }
    }
  }
}

/** The layers to look for images in: the selection, or the whole page when nothing is selected. */
function scope(): { nodes: SceneNode[]; kind: 'selection' | 'page' } {
  const selection = figma.currentPage.selection
  const roots = selection.length ? selection : figma.currentPage.children
  const nodes: SceneNode[] = []
  for (const root of roots) {
    nodes.push(root)
    if ('findAll' in root) nodes.push(...root.findAll(() => true))
  }
  return { nodes, kind: selection.length ? 'selection' : 'page' }
}

const imageFills = (node: SceneNode): ImagePaint[] =>
  'fills' in node && Array.isArray(node.fills)
    ? (node.fills as Paint[]).filter(
        (paint): paint is ImagePaint => paint.type === 'IMAGE' && paint.imageHash !== null,
      )
    : []

async function scan() {
  const { nodes, kind } = scope()
  const found = new Map<
    string,
    { name: string; uses: number; w: number; h: number; tiled: boolean }
  >()
  for (const node of nodes) {
    for (const paint of imageFills(node)) {
      const hash = paint.imageHash!
      const entry = found.get(hash) ?? { name: node.name, uses: 0, w: 0, h: 0, tiled: false }
      entry.uses++
      entry.w = Math.max(entry.w, node.width)
      entry.h = Math.max(entry.h, node.height)
      // A tiled image repeats at its own size: shrinking it would change the pattern.
      entry.tiled ||= paint.scaleMode === 'TILE'
      found.set(hash, entry)
    }
  }
  const images: PlacedImage[] = []
  for (const [hash, entry] of found) {
    const image = figma.getImageByHash(hash)
    if (!image) continue
    const { width, height } = await image.getSizeAsync()
    images.push({
      hash,
      name: entry.name,
      uses: entry.uses,
      width,
      height,
      shownWidth: entry.tiled ? width : Math.ceil(entry.w),
      shownHeight: entry.tiled ? height : Math.ceil(entry.h),
      bytes: await image.getBytesAsync(),
    })
  }
  send({ type: 'scanned', images, scope: kind })
}

function replace(images: { hash: string; bytes: Uint8Array }[]) {
  const swaps = new Map(images.map(({ hash, bytes }) => [hash, figma.createImage(bytes).hash]))
  let count = 0
  for (const node of scope().nodes) {
    if (!imageFills(node).some((paint) => swaps.has(paint.imageHash!))) continue
    const fills = (node as GeometryMixin).fills as Paint[]
    ;(node as GeometryMixin).fills = fills.map((paint) =>
      paint.type === 'IMAGE' && paint.imageHash && swaps.has(paint.imageHash)
        ? { ...paint, imageHash: swaps.get(paint.imageHash)! }
        : paint,
    )
    count++
  }
  figma.commitUndo()
  send({ type: 'replaced', count })
}

function place(
  images: { name: string; bytes: Uint8Array; width: number; height: number }[],
  fill: boolean,
) {
  const targets = fillableOf(figma.currentPage.selection)
  if (fill && targets.length && images[0]) {
    // Keep each layer's size: the image covers it, as a dropped image fill does.
    const imageHash = figma.createImage(images[0].bytes).hash
    for (const node of targets) node.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash }]
    figma.commitUndo()
    send({ type: 'placed', count: targets.length, filled: true })
    return
  }
  const center = figma.viewport.center
  const gap = 40
  const total = images.reduce((sum, image) => sum + image.width, 0) + gap * (images.length - 1)
  let x = Math.round(center.x - total / 2)
  const placed: RectangleNode[] = []
  for (const image of images) {
    const rect = figma.createRectangle()
    rect.name = image.name
    rect.resize(image.width, image.height)
    rect.x = x
    rect.y = Math.round(center.y - image.height / 2)
    rect.fills = [
      { type: 'IMAGE', scaleMode: 'FILL', imageHash: figma.createImage(image.bytes).hash },
    ]
    figma.currentPage.appendChild(rect)
    placed.push(rect)
    x += image.width + gap
  }
  figma.currentPage.selection = placed
  figma.viewport.scrollAndZoomIntoView(placed)
  figma.commitUndo()
  send({ type: 'placed', count: placed.length, filled: false })
}

figma.on('selectionchange', sendSelection)

figma.ui.onmessage = async (message: UiToMain) => {
  switch (message.type) {
    case 'settings':
      await figma.clientStorage.setAsync(SETTINGS_KEY, message.settings)
      break
    case 'render':
      await render(message.job, message.ids, message.sizes)
      break
    case 'scan':
      await scan()
      break
    case 'replace':
      replace(message.images)
      break
    case 'place':
      place(message.images, message.fill)
      break
    case 'open-url':
      figma.openExternal(message.url)
      break
    case 'notify':
      figma.notify(message.message)
      break
  }
}

async function start() {
  const saved = (await figma.clientStorage.getAsync(SETTINGS_KEY)) as Partial<Settings> | undefined
  send({ type: 'ready', settings: { ...DEFAULT_SETTINGS, ...saved }, version: __VERSION__ })
  sendSelection()
}

void start()
