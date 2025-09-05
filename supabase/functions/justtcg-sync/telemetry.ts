/**
 * Structured logging and telemetry for JustTCG operations
 * Provides consistent logging across all sync operations
 */

interface LogContext {
  operation: string;
  game?: string;
  set?: string;
  page?: number;
  duration?: number;
  retryCount?: number;
  timedOut?: boolean;
  cardId?: string;
  condition?: string;
  printing?: string;
  totalItems?: number;
  pagesFetched?: number;
  stoppedReason?: string;
  error?: string;
  statusCode?: number;
  cached?: boolean;
  [key: string]: any;
}

interface OperationTimer {
  start: () => void;
  end: () => number;
}

/**
 * Creates a timer for measuring operation duration
 */
export function createTimer(): OperationTimer {
  let startTime = 0;
  
  return {
    start: () => {
      startTime = Date.now();
    },
    end: () => {
      return Date.now() - startTime;
    }
  };
}

/**
 * Structured logging function with consistent format
 */
export function logStructured(level: 'info' | 'warn' | 'error', message: string, context: LogContext) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    message,
    context: {
      operation: context.operation,
      game: context.game,
      set: context.set,
      page: context.page,
      duration: context.duration,
      retryCount: context.retryCount,
      timedOut: context.timedOut,
      cardId: context.cardId,
      condition: context.condition,
      printing: context.printing,
      totalItems: context.totalItems,
      pagesFetched: context.pagesFetched,
      stoppedReason: context.stoppedReason,
      error: context.error,
      statusCode: context.statusCode,
      cached: context.cached,
      ...Object.fromEntries(
        Object.entries(context).filter(([key]) => 
          !['operation', 'game', 'set', 'page', 'duration', 'retryCount', 'timedOut', 
            'cardId', 'condition', 'printing', 'totalItems', 'pagesFetched', 
            'stoppedReason', 'error', 'statusCode', 'cached'].includes(key)
        )
      )
    }
  };

  // Console logging with emoji indicators
  const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '📊';
  console.log(`${emoji} [${level.toUpperCase()}] ${message}`, logEntry.context);

  // TODO: Add Sentry integration here if available
  // if (typeof Sentry !== 'undefined') {
  //   if (level === 'error') {
  //     Sentry.captureException(new Error(message), {
  //       tags: { operation: context.operation, game: context.game },
  //       extra: context
  //     });
  //   } else {
  //     Sentry.addBreadcrumb({
  //       message,
  //       level: level === 'warn' ? 'warning' : 'info',
  //       data: context
  //     });
  //   }
  // }
}

/**
 * Log operation start with context
 */
export function logOperationStart(operation: string, context: Partial<LogContext> = {}) {
  logStructured('info', `Starting ${operation}`, {
    operation,
    ...context
  });
}

/**
 * Log operation success with metrics
 */
export function logOperationSuccess(operation: string, context: Partial<LogContext> = {}) {
  logStructured('info', `Completed ${operation}`, {
    operation,
    ...context
  });
}

/**
 * Log operation error with full context
 */
export function logOperationError(operation: string, error: Error | string, context: Partial<LogContext> = {}) {
  const errorMessage = error instanceof Error ? error.message : error;
  logStructured('error', `Failed ${operation}: ${errorMessage}`, {
    operation,
    error: errorMessage,
    ...context
  });
}

/**
 * Log operation warning with context
 */
export function logOperationWarning(operation: string, message: string, context: Partial<LogContext> = {}) {
  logStructured('warn', `${operation}: ${message}`, {
    operation,
    ...context
  });
}

/**
 * Log early return with reason and context
 */
export function logEarlyReturn(operation: string, reason: string, context: Partial<LogContext> = {}) {
  logStructured('warn', `Early return from ${operation}: ${reason}`, {
    operation,
    earlyReturn: true,
    reason,
    ...context
  });
}

/**
 * Log retry attempt with context
 */
export function logRetryAttempt(operation: string, attempt: number, totalAttempts: number, context: Partial<LogContext> = {}) {
  logStructured('warn', `Retry ${attempt}/${totalAttempts} for ${operation}`, {
    operation,
    retryCount: attempt,
    totalRetries: totalAttempts,
    ...context
  });
}

/**
 * Log timeout occurrence
 */
export function logTimeout(operation: string, timeoutMs: number, context: Partial<LogContext> = {}) {
  logStructured('error', `Timeout after ${timeoutMs}ms in ${operation}`, {
    operation,
    timedOut: true,
    timeoutMs,
    ...context
  });
}

/**
 * Log pagination progress
 */
export function logPaginationProgress(operation: string, page: number, totalItems: number, context: Partial<LogContext> = {}) {
  logStructured('info', `Pagination progress for ${operation}`, {
    operation,
    page,
    totalItems,
    ...context
  });
}