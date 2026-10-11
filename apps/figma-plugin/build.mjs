// Builds the plugin: dist/code.js (Figma sandbox) and dist/ui.html (single-file UI,
// with the encoder worker and every codec's WebAssembly inside it).
import { build as esbuild, context } from 'esbuild'
import { build as vite } from 'vite'
import preact from '@preact/preset-vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { readFile, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const { version } = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
)
const watch = process.argv.includes('--watch')

/** `import wasm from './codec.wasm?base64'`: the file's bytes as a base64 string. */
const base64 = () => ({
  name: 'imagerefold-base64',
  enforce: 'pre',
  async resolveId(source, importer) {
    if (!source.endsWith('?base64')) return
    const resolved = await this.resolve(source.slice(0, -'?base64'.length), importer, {
      skipSelf: true,
    })
    return resolved && `${resolved.id}?base64`
  },
  async load(id) {
    if (!id.endsWith('?base64')) return
    const bytes = await readFile(id.slice(0, -'?base64'.length))
    return `export default ${JSON.stringify(bytes.toString('base64'))}`
  },
})

/**
 * The codecs' glue code points at its .wasm with `new URL(..., import.meta.url)`.
 * The plugin hands each codec its compiled module instead, so those references
 * are removed rather than bundled a second time.
 */
const noWasmUrls = () => ({
  name: 'imagerefold-no-wasm-urls',
  transform(code, id) {
    if (!id.includes('@jsquash')) return
    return code.replace(/new URL\((["'])[^"']+\.wasm\1,\s*import\.meta\.url\)/g, '""')
  },
})

const define = { __VERSION__: JSON.stringify(version) }

await vite({
  root: `${root}src/ui`,
  configFile: false,
  logLevel: 'warn',
  plugins: [preact(), base64(), noWasmUrls(), viteSingleFile()],
  define,
  worker: { format: 'iife', plugins: () => [base64(), noWasmUrls()] },
  build: {
    outDir: `${root}dist`,
    emptyOutDir: false,
    target: 'es2020',
    assetsInlineLimit: 100_000_000,
    rollupOptions: { input: `${root}src/ui/index.html`, output: { entryFileNames: 'ui.js' } },
    watch: watch ? {} : null,
  },
})

if (!watch) await rename(`${root}dist/index.html`, `${root}dist/ui.html`)

const mainOptions = {
  entryPoints: [`${root}src/main/index.ts`],
  bundle: true,
  outfile: `${root}dist/code.js`,
  target: 'es2017',
  format: 'iife',
  logLevel: 'info',
  define,
}
if (watch) await (await context(mainOptions)).watch()
else await esbuild(mainOptions)
