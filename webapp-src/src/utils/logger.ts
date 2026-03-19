/**
 * Structured Logging Utility
 * Production-grade logging with correlation IDs and structured data
 */

export interface LogContext {
  correlationId?: string;
  userId?: number;
  clientId?: number;
  loanId?: number;
  branchId?: number;
  [key: string]: any;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export class Logger {
  /**
   * Log informational message
   */
  static info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  /**
   * Log warning message
   */
  static warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  /**
   * Log error with stack trace
   */
  static error(message: string, error?: Error, context?: LogContext): void {
    const entry: LogEntry = {
      level: 'error',
      message,
      timestamp: new Date().toISOString(),
      context,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    console.log(JSON.stringify(entry));
  }

  /**
   * Log debug message (only in development)
   */
  static debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === 'development') {
      this.log('debug', message, context);
    }
  }

  /**
   * Log fatal error
   */
  static fatal(message: string, error?: Error, context?: LogContext): void {
    const entry: LogEntry = {
      level: 'fatal',
      message,
      timestamp: new Date().toISOString(),
      context,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    console.log(JSON.stringify(entry));
  }

  /**
   * Log performance metrics
   */
  static performance(
    operation: string,
    duration: number,
    context?: LogContext
  ): void {
    this.log('info', `Performance: ${operation}`, {
      ...context,
      type: 'performance',
      operation,
      duration,
    });
  }

  /**
   * Log business event
   */
  static businessEvent(
    eventType: string,
    eventData: Record<string, any>,
    context?: LogContext
  ): void {
    this.log('info', `Business Event: ${eventType}`, {
      ...context,
      type: 'business_event',
      eventType,
      eventData,
    });
  }

  private static log(
    level: LogLevel,
    message: string,
    context?: LogContext
  ): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
    };

    console.log(JSON.stringify(entry));
  }
}

/**
 * Create a logger with pre-filled context
 */
export function createContextLogger(baseContext: LogContext) {
  return {
    info: (message: string, context?: LogContext) =>
      Logger.info(message, { ...baseContext, ...context }),
    warn: (message: string, context?: LogContext) =>
      Logger.warn(message, { ...baseContext, ...context }),
    error: (message: string, error?: Error, context?: LogContext) =>
      Logger.error(message, error, { ...baseContext, ...context }),
    debug: (message: string, context?: LogContext) =>
      Logger.debug(message, { ...baseContext, ...context }),
  };
}
