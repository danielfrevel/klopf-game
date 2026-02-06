import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LoggerService {
  debug(category: string, message: string, data?: unknown): void {
    console.debug(`[${category}]`, message, data ?? '');
  }

  info(category: string, message: string, data?: unknown): void {
    console.info(`[${category}]`, message, data ?? '');
  }

  warn(category: string, message: string, data?: unknown): void {
    console.warn(`[${category}]`, message, data ?? '');
  }

  error(category: string, message: string, data?: unknown): void {
    console.error(`[${category}]`, message, data ?? '');
  }
}
