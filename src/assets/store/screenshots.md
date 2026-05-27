# Screenshot Guide for Chrome Web Store

## Requirements
- Format: PNG or JPEG
- Minimum dimensions: 1280×720
- Maximum dimensions: 3840×2160
- Max file size: 2 MB each
- At least 1 screenshot required, max 5

## How to Take Screenshots

1. Open the extension tab (`chrome-extension://<id>/src/tab/index.html`)
2. Set window to **1280×800** (use Window Resizer extension or DevTools)
3. Take clean screenshots with no devtools visible

## Recommended Screenshots

### 1. Home – Hero + Carousels (1280×800)
Show the full homepage with:
- Hero carousel visible at top (fade transition)
- "My Series" row with cards (at least 3-4 visible)
- "New This Week" row
- Filter bar showing "All" selected
- Caption: *"Home page with hero carousel, series tracking, and New This Week"*

### 2. Episode Detail Modal (1280×800)
Show a series expanded:
- Detail modal with episode list
- Sort dropdown visible
- Publish dates, watched/unwatched states
- Caption: *"Episode detail view with sort options and progress tracking"*

### 3. Hover Preview (1280×800)
Show a card being hovered:
- Play button overlay on thumbnail
- The hover preview iframe playing a video (screenshot mid-playback)
- Caption: *"Hover to preview episodes without leaving the page"*

### 4. YouTube Sidebar Integration (1280×800)
Show YouTube with the sidebar:
- YT Series section injected in YouTube's left sidebar
- Caption: *"Quick access to your series directly from YouTube"*

### 5. Settings Panel (1280×800)
Show settings:
- Theme selector (Classic Red / Ocean Blue / Forest)
- Language selector (English / Italiano)
- License key input for Pro
- Caption: *"Customizable themes, language, and Pro licensing"*

## Screenshot Files
Save screenshots in this directory as:
- `screenshot-01-home.png`
- `screenshot-02-detail.png`
- `screenshot-03-preview.png`
- `screenshot-04-sidebar.png`
- `screenshot-05-settings.png`

## Promo Tiles (Optional)
- **Small promo tile**: 440×280 PNG
- **Marquee promo tile**: 1400×560 PNG
- Save as `promo-small.png` and `promo-marquee.png`
