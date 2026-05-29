const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
}

class Logger {
  constructor(level = LOG_LEVELS.INFO) {
    this.level = level
  }

  setLevel(level) {
    this.level = level
  }

  debug(...args) {
    if (this.level <= LOG_LEVELS.DEBUG) {
      console.debug('[YT Series][DEBUG]', ...args)
    }
  }

  info(...args) {
    if (this.level <= LOG_LEVELS.INFO) {
      console.info('[YT Series][INFO]', ...args)
    }
  }

  warn(...args) {
    if (this.level <= LOG_LEVELS.WARN) {
      console.warn('[YT Series][WARN]', ...args)
    }
  }

  error(...args) {
    if (this.level <= LOG_LEVELS.ERROR) {
      console.error('[YT Series][ERROR]', ...args)
    }
  }
}

const logger = new Logger()

export { logger }
