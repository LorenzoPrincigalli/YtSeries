// Minimal CSS sanity check (no dependencies): unbalanced braces and
// declarations outside any rule — the silent failure mode where a browser
// drops the next rule. Run: node scripts/lint-css.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const walk = dir => readdirSync(dir).flatMap(name => {
  const full = join(dir, name)
  return statSync(full).isDirectory() ? walk(full) : full.endsWith('.css') ? [full] : []
})

let problems = 0
for (const file of walk(join(root, 'src'))) {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '))
  let depth = 0
  let line = 1
  let pending = ''
  for (const ch of css) {
    if (ch === '\n') line++
    if (ch === '{') { depth++; pending = '' } else if (ch === '}') {
      depth--
      if (depth < 0) { console.error(`${relative(root, file)}:${line} unexpected "}"`); problems++; depth = 0 }
      pending = ''
    } else if (depth === 0) {
      pending += ch
      // At top level only selectors and @-rules may appear; ";" ends an @import/@charset only.
      if (ch === ';' && !pending.trim().startsWith('@')) {
        console.error(`${relative(root, file)}:${line} declaration outside a rule: ${pending.trim().slice(0, 60)}`)
        problems++
        pending = ''
      } else if (ch === ';') pending = ''
    }
  }
  if (depth !== 0) { console.error(`${relative(root, file)}: ${depth} unclosed "{"`); problems++ }
}
if (problems) process.exit(1)
console.log('CSS OK')
