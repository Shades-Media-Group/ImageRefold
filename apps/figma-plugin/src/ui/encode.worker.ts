/**
 * Encodes images off the window's main thread, with the WebAssembly builds of
 * libwebp, libavif, MozJPEG and OxiPNG. Each codec's .wasm is embedded in the
 * plugin (see build.mjs), so nothing is fetched: the manifest allows no network.
 */
import webpFactory from '@jsquash/webp/codec/enc/webp_enc.js'
import avifFactory from '@jsquash/avif/codec/enc/avif_enc.js'
import jpegFactory from '@jsquash/jpeg/codec/enc/mozjpeg_enc.js'
import oxipngInit, { optimise_raw } from '@jsquash/oxipng/codec/pkg/squoosh_oxipng.js'
import { initEmscriptenModule } from '@jsquash/webp/utils.js'
import { defaultOptions as webpDefaults } from '@jsquash/webp/meta.js'
import { defaultOptions as avifDefaults } from '@jsquash/avif/meta.js'
import { defaultOptions as jpegDefaults } from '@jsquash/jpeg/meta.js'
import webpWasm from '@jsquash/webp/codec/enc/webp_enc.wasm?base64'
import avifWasm from '@jsquash/avif/codec/enc/avif_enc.wasm?base64'
import jpegWasm from '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?base64'
import oxipngWasm from '@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm?base64'
import type { Format } from '../shared/messages'
import { avifQuality, type EncodeRequest, type EncodeResult } from './encoding'

interface Codec {
  encode(data: Uint8ClampedArray, width: number, height: number, options: object): Uint8Array
}

const compile = (base64: string) =>
  WebAssembly.compile(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)))

// Each codec is compiled the first time it is used, then kept.
const cache = new Map<string, Promise<Codec>>()
const codec = (name: string, factory: unknown, wasm: string) => {
  if (!cache.has(name))
    cache.set(
      name,
      compile(wasm).then(
        (module) => initEmscriptenModule(factory as never, module) as Promise<Codec>,
      ),
    )
  return cache.get(name)!
}
let oxipngReady: Promise<unknown> | undefined

async function pixels(bytes: Uint8Array, maxWidth?: number, maxHeight?: number, flatten?: boolean) {
  const blob = new Blob([bytes as BlobPart])
  let bitmap = await createImageBitmap(blob)
  const scale = Math.min(
    1,
    (maxWidth ?? Infinity) / bitmap.width,
    (maxHeight ?? Infinity) / bitmap.height,
  )
  if (scale < 1) {
    const resized = await createImageBitmap(blob, {
      resizeWidth: Math.max(1, Math.round(bitmap.width * scale)),
      resizeHeight: Math.max(1, Math.round(bitmap.height * scale)),
      resizeQuality: 'high',
    })
    bitmap.close()
    bitmap = resized
  }
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  if (flatten) {
    // JPG has no transparency: transparent pixels land on white, as in Figma's own JPG export.
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

function hasAlpha(data: Uint8ClampedArray) {
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) return true
  return false
}

async function encode(
  request: EncodeRequest,
): Promise<Extract<EncodeResult, { bytes: Uint8Array }>> {
  const { quality, lossless } = request
  let image = await pixels(request.bytes, request.maxWidth, request.maxHeight)
  const format: Format =
    request.format === 'figma' ? (hasAlpha(image.data) ? 'png' : 'jpeg') : request.format
  if (format === 'jpeg' && hasAlpha(image.data))
    image = await pixels(request.bytes, request.maxWidth, request.maxHeight, true)
  let out: Uint8Array
  switch (format) {
    case 'webp': {
      const webp = await codec('webp', webpFactory, webpWasm)
      out = webp.encode(image.data, image.width, image.height, {
        ...webpDefaults,
        quality: lossless ? 100 : quality,
        lossless: lossless ? 1 : 0,
        method: 6,
      })
      break
    }
    case 'avif': {
      const avif = await codec('avif', avifFactory, avifWasm)
      // Lossless AVIF needs full-resolution colour (4:4:4) and quality 100.
      const options = lossless
        ? { quality: 100, qualityAlpha: -1, subsample: 3 }
        : { quality: avifQuality(quality) }
      out = avif.encode(new Uint8Array(image.data.buffer) as never, image.width, image.height, {
        ...avifDefaults,
        ...options,
      })
      break
    }
    case 'jpeg': {
      const jpeg = await codec('jpeg', jpegFactory, jpegWasm)
      out = jpeg.encode(image.data, image.width, image.height, { ...jpegDefaults, quality })
      break
    }
    case 'png': {
      oxipngReady ??= compile(oxipngWasm).then((module) => oxipngInit(module))
      await oxipngReady
      out = optimise_raw(image.data, image.width, image.height, 2, false, true)
      break
    }
  }
  return {
    id: request.id,
    bytes: new Uint8Array(out),
    width: image.width,
    height: image.height,
    format,
  }
}

self.onmessage = async (event: MessageEvent<EncodeRequest>) => {
  try {
    const result = await encode(event.data)
    self.postMessage(result, { transfer: [result.bytes.buffer] })
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
