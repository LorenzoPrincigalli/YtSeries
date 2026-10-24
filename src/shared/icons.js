// @ts-check
// Inline SVG icon registry, built with createElementNS (no markup strings).

const SVG_NS = 'http://www.w3.org/2000/svg'
// Filled icons take the text colour of their button, like the stroked ones.
const FILL = { fill: 'currentColor' }
const STROKE = { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }

/** @type {Record<string, { viewBox: string, attrs?: Record<string, string>, paths: string[] }>} */
const ICONS = {
  close: { viewBox: '0 0 16 16', attrs: { ...STROKE, 'stroke-width': '2' }, paths: ['M4 4l8 8M12 4l-8 8'] },
  chevronLeft: { viewBox: '0 0 24 24', attrs: FILL, paths: ['M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z'] },
  chevronRight: { viewBox: '0 0 24 24', attrs: FILL, paths: ['M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z'] },
  play: { viewBox: '0 0 24 24', attrs: FILL, paths: ['M8 5v14l11-7z'] },
  folder: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M3.5 6.5A2.5 2.5 0 0 1 6 4h4l2 2h6a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5z'] },
  trash: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M5 7h14m-9 0V5h4v2m-7 0 1 13h8l1-13m-6 3v7m4-7v7'] },
  check: { viewBox: '0 0 16 16', attrs: { ...STROKE, 'stroke-width': '2.2' }, paths: ['M3.5 8.5l3 3 6-7'] },
  refresh: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7'] },
  share: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M12 15V4m0 0L8 8m4-4 4 4', 'M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12'] },
  note: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z', 'M13.5 6.5l4 4'] },
  warning: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M12 4 2.8 19.5h18.4z', 'M12 10v4.5m0 2.5v.01'] },
  flag: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M5 21V4', 'M5 4h12l-2.5 4L17 12H5'] },
  // Achievement badges (src/shared/achievements.js)
  film: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M4 5h16v14H4z', 'M8 5v14M16 5v14M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4'] },
  clock: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3.5 2'] },
  trophy: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M8 4h8v5a4 4 0 0 1-8 0z', 'M8 6H5.5a2.5 2.5 0 0 0 2.6 4M16 6h2.5a2.5 2.5 0 0 1-2.6 4', 'M12 13v4M8.5 20.5h7M10 17h4v3.5h-4z'] },
  flame: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M12 3c.8 3.5 5 5.4 5 10.2A5 5 0 0 1 7 13.3c0-2.6 1.4-4.2 2.6-5.3.2 2 1.2 3.2 2.4 3.6C11.6 9 11 6.3 12 3z'] },
  layers: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M12 4 3 8.5l9 4.5 9-4.5z', 'M3 12.5l9 4.5 9-4.5', 'M3 16.5l9 4.5 9-4.5'] },
  target: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M12 12.01V12'] },
  moon: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'] },
  sun: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'] },
  compass: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M15.5 8.5l-2 5-5 2 2-5z'] },
  search: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'm20 20-4-4'] },
  stack: { viewBox: '0 0 24 24', attrs: STROKE, paths: ['M7 3.5h10M5 6.5h14', 'M3 9.5h18v11H3z'] }
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
