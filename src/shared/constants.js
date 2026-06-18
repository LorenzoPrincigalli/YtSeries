const STORAGE_KEYS = {
  SERIES: 'series',
  SETTINGS: 'settings',
  LICENSE: 'license'
}

const SYNC_STORAGE_KEYS = {
  AUTH: '_firebaseAuth',
  QUEUE: '_syncQueue',
  STATUS: '_syncStatus'
}

const SYNC_PUSH_DEBOUNCE_MS = 3000

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
    primaryRgb: '255, 0, 0',
    primaryHover: '#cc0000',
    text: '#f1f1f1',
    textMuted: '#aaaaaa',
    cardBg: '#1a1a1a',
    cardHover: '#2a2a2a',
    border: '#333',
    modalBg: '#212121',
    danger: '#E50914',
    success: '#2ecc71',
    warning: '#f97316',
    borderLight: 'rgba(255,255,255,0.08)'
  },
  'ocean-blue': {
    bg: '#0a1628',
    surface: '#0f1f3d',
    primary: '#1e90ff',
    primaryRgb: '30, 144, 255',
    primaryHover: '#187bda',
    text: '#e0e8f0',
    textMuted: '#607080',
    cardBg: '#152540',
    cardHover: '#1a2f50',
    border: '#1a3050',
    modalBg: '#0f1f3d',
    danger: '#E50914',
    success: '#2ecc71',
    warning: '#f97316',
    borderLight: 'rgba(200,220,255,0.08)'
  },
  'forest': {
    bg: '#0f1a0f',
    surface: '#1a2a1a',
    primary: '#2ecc71',
    primaryRgb: '46, 204, 113',
    primaryHover: '#27ae60',
    text: '#e0f0e0',
    textMuted: '#608060',
    cardBg: '#1f301f',
    cardHover: '#2a402a',
    border: '#2a3a2a',
    modalBg: '#1a2a1a',
    danger: '#E50914',
    success: '#2ecc71',
    warning: '#f97316',
    borderLight: 'rgba(180,220,180,0.08)'
  },
  'light': {
    bg: '#f8f6f3',
    surface: '#ffffff',
    primary: '#d40000',
    primaryRgb: '212, 0, 0',
    primaryHover: '#b30000',
    text: '#1a1a1a',
    textMuted: '#888888',
    cardBg: '#ffffff',
    cardHover: '#f0eeeb',
    border: '#e0ddd8',
    modalBg: '#ffffff',
    danger: '#d40000',
    success: '#1a8a3a',
    warning: '#d97706',
    borderLight: 'rgba(0,0,0,0.06)'
  }
}

const LICENSE_CACHE_DAYS = 1
const AUTO_REFRESH_INTERVAL_MINUTES = 1440
const YOUTUBE_API_MAX_RESULTS = 50

const GITHUB_URL = 'https://github.com/LorenzoPrincigalli/YtSeries'

const SUPPORT_URL = 'https://buymeacoffee.com/ytseriessun'

const EXTENSION_ID = '' // Set after publishing to Chrome Web Store

export {
  STORAGE_KEYS,
  SYNC_STORAGE_KEYS,
  SYNC_PUSH_DEBOUNCE_MS,
  API,
  FREE_LIMITS,
  THEME_COLORS,
  LICENSE_CACHE_DAYS,
  AUTO_REFRESH_INTERVAL_MINUTES,
  YOUTUBE_API_MAX_RESULTS,
  EXTENSION_ID,
  GITHUB_URL,
  SUPPORT_URL
}
