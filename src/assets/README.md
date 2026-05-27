# Assets

| Directory | Purpose |
|-----------|---------|
| `icons/` | SVG source files for extension icons |
| `store/` | Chrome Web Store materials (screenshots, privacy policy) |
| `scripts/` | Build tools (icon PNG generation) |

## Icons

Source SVGs in `icons/` are the single source of truth:

- `icon.svg` – dark theme (default)
- `icon_light.svg` – light theme variant for toolbar

To regenerate PNGs at all required sizes (16, 48, 128):

```bash
npm run icons
```

Output goes to `icons/` (project root), as declared in `manifest.json`.

## Chrome Web Store

### Required
| Item | File | Notes |
|------|------|-------|
| Privacy policy | `store/privacy-policy.html` | Host on GitHub Pages, link in CWS listing |
| Screenshots | `store/screenshot-*.png` | See `store/screenshots.md` for guide |

### Optional
- Small promo tile (440×280)
- Marquee promo tile (1400×560)

## Workflow
1. Edit the SVG icons in `src/assets/icons/`
2. Run `npm run icons` to regenerate PNGs
3. Take screenshots per `store/screenshots.md`
4. Host `privacy-policy.html` on a public URL
5. Submit to Chrome Web Store Developer Dashboard
