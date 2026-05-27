const STORAGE_KEYS = {
  SERIES: 'series',
  SETTINGS: 'settings',
  LICENSE: 'license'
}

const API = {
  YOUTUBE_BASE: 'https://www.googleapis.com/youtube/v3',
  WORKER_BASE: 'https://shy-snowflake-0680.lollo-princigalli.workers.dev'
}

const FREE_LIMITS = {
  MAX_SERIES: 3
}

const THEME_COLORS = {
  'classic-red': {
    bg: '#0f0f0f',
    surface: '#212121',
    primary: '#ff0000',
    text: '#f1f1f1',
    textMuted: '#aaaaaa',
    cardBg: '#1a1a1a',
    hover: '#2a2a2a'
  },
  'ocean-blue': {
    bg: '#0a1628',
    surface: '#0f1f3d',
    primary: '#1e90ff',
    text: '#e0e8f0',
    textMuted: '#607080',
    cardBg: '#152540',
    hover: '#1a2f50'
  },
  'forest': {
    bg: '#0f1a0f',
    surface: '#1a2a1a',
    primary: '#2ecc71',
    text: '#e0f0e0',
    textMuted: '#608060',
    cardBg: '#1f301f',
    hover: '#2a402a'
  }
}

const LICENSE_CACHE_DAYS = 1
const AUTO_REFRESH_INTERVAL_MINUTES = 1440
const YOUTUBE_API_MAX_RESULTS = 50

const PRO_CHECKOUT = {
  URL: '' // Set your Lemon Squeezy checkout URL here
}

export {
  STORAGE_KEYS,
  API,
  FREE_LIMITS,
  THEME_COLORS,
  LICENSE_CACHE_DAYS,
  AUTO_REFRESH_INTERVAL_MINUTES,
  YOUTUBE_API_MAX_RESULTS,
  PRO_CHECKOUT
}
