export class Logger {
  private static enabled = true;

  public static setEnabled(val: boolean): void {
    Logger.enabled = val;
  }

  public static info(message: string, meta?: Record<string, string | number | boolean>): void {
    if (!Logger.enabled) return;
    if (meta) {
      console.log(`[PHERO] ${message}`, meta);
    } else {
      console.log(`[PHERO] ${message}`);
    }
  }

  public static warn(message: string, meta?: Record<string, string | number | boolean>): void {
    if (!Logger.enabled) return;
    if (meta) {
      console.warn(`[PHERO] ${message}`, meta);
    } else {
      console.warn(`[PHERO] ${message}`);
    }
  }

  public static error(message: string, error?: unknown): void {
    if (!Logger.enabled) return;
    const errMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    console.error(`[PHERO] ERROR: ${message} - ${errMessage}`);
  }
}
