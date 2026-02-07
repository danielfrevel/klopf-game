type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function format(level: LogLevel, ctx: string, msg: string, data?: unknown): string {
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = `${ts} [${level.toUpperCase().padEnd(5)}] [${ctx}]`;
  return data ? `${prefix} ${msg} ${JSON.stringify(data)}` : `${prefix} ${msg}`;
}

function createLogger(ctx: string) {
  return {
    debug: (msg: string, data?: unknown) => shouldLog('debug') && console.debug(format('debug', ctx, msg, data)),
    info: (msg: string, data?: unknown) => shouldLog('info') && console.log(format('info', ctx, msg, data)),
    warn: (msg: string, data?: unknown) => shouldLog('warn') && console.warn(format('warn', ctx, msg, data)),
    error: (msg: string, data?: unknown) => shouldLog('error') && console.error(format('error', ctx, msg, data)),
  };
}

export const log = {
  game: createLogger('Game'),
  ws: createLogger('WS'),
  klopf: createLogger('Klopf'),
  room: createLogger('Room'),
};
