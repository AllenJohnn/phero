export class Logger {
  static enabled = true;
  static setEnabled(val) {
    Logger.enabled = val;
  }
  static info(message, meta) {
    if (!Logger.enabled) return;
    if (meta) {
      console.log(`[PHERO] ${message}`, meta);
    } else {
      console.log(`[PHERO] ${message}`);
    }
  }
  static warn(message, meta) {
    if (!Logger.enabled) return;
    if (meta) {
      console.warn(`[PHERO] ${message}`, meta);
    } else {
      console.warn(`[PHERO] ${message}`);
    }
  }
  static error(message, error) {
    if (!Logger.enabled) return;
    const errMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    console.error(`[PHERO] ERROR: ${message} - ${errMessage}`);
  }
}