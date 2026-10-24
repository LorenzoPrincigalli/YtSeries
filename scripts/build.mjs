// Builds the extension into dist/ keeping the source layout, so every
// chrome.runtime.getURL('src/...') path stays valid. Load dist/ as unpacked.
import { build, context } from 'esbuild'
import { cp, mkdir, rm, readdir, stat } from 'node:fs/promises'
import { watch as watchFiles } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outdir = join(root, 'dist')
const watch = process.argv.includes('--watch')

const ENTRIES = [
  { in: 'src/background/index.js', format: 'esm' },
  { in: 'src/tab/app.js', format: 'esm' },
  // Content scripts cannot be ES modules.
  { in: 'src/content/index.js', format: 'iife' },
  { in: 'src/popup/popup.js', format: 'esm' }
]

const STATIC_EXTENSIONS = new Set(['.html', '.css', '.woff2', '.png', '.svg', '.json'])
// Fetched as text at runtime by FirebaseConfig.js; optional and gitignored.
const OPTIONAL_FILES = ['src/shared/firebase.config.js']

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'assets') continue
      out.push(...await walk(full))
    } else {
      out.push(full)
    }
  }
  return out
}

async function exists(path) {
  try { await stat(path); return true } catch { return false }
}

/** @param {string} file absolute path of a static file under src/ */
async function copyToDist(file) {
  const target = join(outdir, relative(root, file))
  await mkdir(dirname(target), { recursive: true })
  await cp(file, target)
}

async function copyStatic() {
  await cp(join(root, 'manifest.json'), join(outdir, 'manifest.json'))
  await cp(join(root, 'icons'), join(outdir, 'icons'), { recursive: true })
  for (const file of await walk(join(root, 'src'))) {
    if (STATIC_EXTENSIONS.has(extname(file))) await copyToDist(file)
  }
  for (const file of OPTIONAL_FILES) {
    if (await exists(join(root, file))) await cp(join(root, file), join(outdir, file))
  }
}

function options(entry) {
  return {
    entryPoints: [join(root, entry.in)],
    outfile: join(outdir, entry.in),
    bundle: true,
    format: entry.format,
    target: 'chrome116',
    sourcemap: 'linked',
    legalComments: 'none',
    logLevel: 'warning'
  }
}

await rm(outdir, { recursive: true, force: true })
await mkdir(outdir, { recursive: true })
await copyStatic()

if (watch) {
  for (const entry of ENTRIES) await (await context(options(entry))).watch()
  // HTML/CSS are not part of the bundles: copy them again whenever they change,
  // otherwise dist/ silently keeps stale styles (e.g. content.css on YouTube).
  watchFiles(join(root, 'src'), { recursive: true }, (_event, name) => {
    if (!name || !STATIC_EXTENSIONS.has(extname(name)) || name.split(/[\\/]/).some(part => part === '__tests__' || part === 'assets')) return
    copyToDist(join(root, 'src', name)).catch(() => {}) // deleted or mid-save: the next event copies it
  })
  console.log('Watching for changes (bundles and static files)…')
} else {
  await Promise.all(ENTRIES.map(entry => build(options(entry))))
  console.log(`Built extension into ${relative(root, outdir)}/`)
}
