const _log: Record<string, (...args: any[]) => void> = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
};

export function setLogger(l: any) {
  _log.trace = l.trace?.bind(l) || (() => {});
  _log.debug = l.debug?.bind(l) || (() => {});
  _log.info = l.info?.bind(l) || (() => {});
  _log.warn = l.warn?.bind(l) || (() => {});
  _log.error = l.error?.bind(l) || (() => {});
  _log.fatal = l.fatal?.bind(l) || (() => {});
}

export const logger = _log;
