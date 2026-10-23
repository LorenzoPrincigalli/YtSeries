// Builds the Chrome Web Store upload: dist/ without source maps and without
// the manifest "key" (it pins the store id for unpacked development builds;
// the Web Store rejects packages that carry it).
//   npm run package   →   yt-series-<version>.zip
import { execFileSync } from 'node:child_process'
import { cp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const staging = join(root, 'dist-release')

execFileSync(process.execPath, [join(root, 'scripts', 'build.mjs')], { stdio: 'inherit' })

await rm(staging, { recursive: true, force: true })
await cp(dist, staging, { recursive: true, filter: source => !source.endsWith('.map') })

const manifestPath = join(staging, 'manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
delete manifest.key
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

const zip = join(root, `yt-series-${manifest.version}.zip`)
await rm(zip, { force: true })
// bsdtar (Windows 10+ System32, macOS) writes zip with -a; Git Bash's GNU tar
// cannot, so on Windows call the system one explicitly. Else fall back to Info-ZIP.
const tar = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
try {
  execFileSync(tar, ['-a', '-c', '-f', zip, '-C', staging, '.'], { stdio: 'inherit' })
} catch {
  execFileSync('zip', ['-r', '-q', zip, '.'], { cwd: staging, stdio: 'inherit' })
}
await rm(staging, { recursive: true, force: true })
console.log(`Packaged ${zip} (version ${manifest.version}, no "key", no source maps)`)
