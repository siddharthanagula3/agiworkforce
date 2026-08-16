
const isDevelopment = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';

function shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
  if (isDevelopment) return true;
  return level === 'warn' || level === 'error';
}

export const logger = {
  debug: (message: string, ...args: unknown[]) => {
    if (shouldLog('debug')) console.debug(`[DEBUG] ${message}`, ...args);
  },
  info: (message: string, ...args: unknown[]) => {
    if (shouldLog('info')) console.info(`[INFO] ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    if (shouldLog('warn')) console.warn(`[WARN] ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    if (shouldLog('error')) console.error(`[ERROR] ${message}`, ...args);
  },
  auth: (message: string, ...args: unknown[]) => {
    if (isDevelopment) console.info(`[AUTH] ${message}`, ...args);
  },
  app: (message: string, ...args: unknown[]) => {
    console.info(`[APP] ${message}`, ...args);
  },
};

export default logger;
