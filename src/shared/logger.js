const LOG_LEVELS = {
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
