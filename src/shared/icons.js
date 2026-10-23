// @ts-check
// Inline SVG icon registry, built with createElementNS (no markup strings).

const SVG_NS = 'http://www.w3.org/2000/svg'
const STROKE = { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }

/** @type {Record<string, { viewBox: string, attrs?: Record<string, string>, paths: string[] }>} */
const ICONS = {
  close: { viewBox: '0 0 16 16', attrs: { ...STROKE, 'stroke-width': '2' }, paths: ['M4 4l8 8M12 4l-8 8'] },
  chevronLeft: { viewBox: '0 0 24 24', paths: ['M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z'] },
  chevronRight: { viewBox: '0 0 24 24', paths: ['M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z'] },
  play: { viewBox: '0 0 24 24', paths: ['M8 5v14l11-7z'] },
  folder: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M3.5 6.5A2.5 2.5 0 0 1 6 4h4l2 2h6a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5z'] },
  trash: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M5 7h14m-9 0V5h4v2m-7 0 1 13h8l1-13m-6 3v7m4-7v7'] },
  check: { viewBox: '0 0 16 16', attrs: { ...STROKE, 'stroke-width': '2.2' }, paths: ['M3.5 8.5l3 3 6-7'] },
  refresh: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7'] },
  share: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M12 15V4m0 0L8 8m4-4 4 4', 'M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12'] }
}

/**
 * @param {keyof typeof ICONS} name
 * @param {{ class?: string }} [options]
 * @returns {SVGSVGElement}
 */
export function svg(name, { class: className } = {}) {
  const icon = ICONS[name]
  if (!icon) throw new Error(`Unknown icon: ${name}`)
  const root = document.createElementNS(SVG_NS, 'svg')
  root.setAttribute('viewBox', icon.viewBox)
  root.setAttribute('aria-hidden', 'true')
  root.setAttribute('focusable', 'false')
  if (className) root.setAttribute('class', className)
  for (const [key, value] of Object.entries(icon.attrs || {})) root.setAttribute(key, value)
  for (const d of icon.paths) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    root.append(path)
  }
  return root
}
