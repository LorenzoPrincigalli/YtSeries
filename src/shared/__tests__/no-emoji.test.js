import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Project rule: no emoji in the product. Icons are SVG (src/shared/icons.js);
// emoji render differently on every OS and clash with the design.
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
// Pictographs, dingbats/misc symbols with an emoji presentation, the emoji
// variation selector and ▶ (often drawn as an emoji).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{25B6}\u{23E9}-\u{23FA}]|\u{FE0F}/u

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (name === '__tests__' || name === 'assets') return []
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

describe('no emoji', () => {
  it('appears in the extension sources', () => {
    const offenders = []
    for (const file of [...walk(join(root, 'src')), join(root, 'share.html')]) {
      if (!/\.(js|html|css|json)$/.test(file)) continue
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const match = line.match(EMOJI)
        if (match) offenders.push(`${relative(root, file)}:${i + 1} ${match[0]}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
