import { Injectable } from '@angular/core';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
}

interface LogEntryForServer {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
}

@Injectable({
  providedIn: 'root'
})
export class LoggerService {
  private logs: LogEntry[] = [];
  private pendingLogs: LogEntryForServer[] = [];
  private maxLogs = 500;
  private enableConsole = true;
  private enableFileLogging = true;
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private readonly LOG_ENDPOINT = '/api/logs';

  private levelColors: Record<LogLevel, string> = {
    debug: '#888',
    info: '#2196F3',
    warn: '#FF9800',
    error: '#F44336'
  };

  constructor() {
    this.startAutoFlush();
    window.addEventListener('beforeunload', () => this.flush());
  }

  private startAutoFlush(): void {
    this.flushInterval = setInterval(() => this.flush(), 2000);
  }

  debug(category: string, message: string, data?: unknown): void {
    this.log('debug', category, message, data);
  }

  info(category: string, message: string, data?: unknown): void {
    this.log('info', category, message, data);
  }

  warn(category: string, message: string, data?: unknown): void {
    this.log('warn', category, message, data);
  }

  error(category: string, message: string, data?: unknown): void {
    this.log('error', category, message, data);
  }

  private log(level: LogLevel, category: string, message: string, data?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      data
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (this.enableConsole) {
      const time = entry.timestamp.toISOString().substring(11, 23);
      const color = this.levelColors[level];
      const prefix = `%c[${time}] [${level.toUpperCase()}] [${category}]`;

      if (data !== undefined) {
        console.log(prefix, `color: ${color}`, message, data);
      } else {
        console.log(prefix, `color: ${color}`, message);
      }
    }

    if (this.enableFileLogging) {
      this.pendingLogs.push({
        timestamp: entry.timestamp.toISOString(),
        level: entry.level,
        category: entry.category,
        message: entry.message,
        data: entry.data
      });
    }
  }

  flush(): void {
    if (this.pendingLogs.length === 0) {
      return;
    }

    const logsToSend = [...this.pendingLogs];
    this.pendingLogs = [];

    fetch(this.LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logsToSend)
    }).catch(err => {
      // Re-add logs if send failed
      this.pendingLogs = [...logsToSend, ...this.pendingLogs];
      if (this.enableConsole) {
        console.error('Failed to send logs to server:', err);
      }
    });
  }

  setFileLoggingEnabled(enabled: boolean): void {
    this.enableFileLogging = enabled;
  }

  getLogs(filter?: { level?: LogLevel; category?: string }): LogEntry[] {
    let filtered = this.logs;

    if (filter?.level) {
      filtered = filtered.filter(l => l.level === filter.level);
    }
    if (filter?.category) {
      filtered = filtered.filter(l => l.category === filter.category);
    }

    return [...filtered];
  }

  getRecentLogs(count: number = 50): LogEntry[] {
    return this.logs.slice(-count);
  }

  clearLogs(): void {
    this.logs = [];
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  setConsoleEnabled(enabled: boolean): void {
    this.enableConsole = enabled;
  }
}
