const STORAGE_KEYS = {
  SERIES: 'series',
  SETTINGS: 'settings',
  LICENSE: 'license'
}

const API = {
  YOUTUBE_BASE: 'https://www.googleapis.com/youtube/v3',
  API_KEY: 'AIzaSyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
}

const FREE_LIMITS = {
  MAX_SERIES: 999
}

const THEMES = {
  CLASSIC_RED: 'classic-red',
  OCEAN_BLUE: 'ocean-blue',
  FOREST: 'forest'
}

const THEME_COLORS = {
  [THEMES.CLASSIC_RED]: {
    bg: '#0f0f0f',
    surface: '#212121',
    primary: '#ff0000',
    text: '#f1f1f1',
    textMuted: '#aaaaaa',
    cardBg: '#1a1a1a',
    hover: '#2a2a2a'
  },
  [THEMES.OCEAN_BLUE]: {
    bg: '#0a1628',
    surface: '#0f1f3d',
    primary: '#1e90ff',
    text: '#e0e8f0',
    textMuted: '#607080',
    cardBg: '#152540',
    hover: '#1a2f50'
  },
  [THEMES.FOREST]: {
    bg: '#0f1a0f',
    surface: '#1a2a1a',
    primary: '#2ecc71',
    text: '#e0f0e0',
    textMuted: '#608060',
    cardBg: '#1f301f',
    hover: '#2a402a'
  }
}

const LICENSE_CACHE_DAYS = 30
const AUTO_REFRESH_INTERVAL_MINUTES = 1440
const YOUTUBE_API_MAX_RESULTS = 50

export {
  STORAGE_KEYS,
  API,
  FREE_LIMITS,
  THEMES,
  THEME_COLORS,
  LICENSE_CACHE_DAYS,
  AUTO_REFRESH_INTERVAL_MINUTES,
  YOUTUBE_API_MAX_RESULTS
}
