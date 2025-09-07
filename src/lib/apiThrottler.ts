/**
 * API Throttler - Advanced throttling for TCGCSV API
 * Manages rate limits, retries, and background task scheduling
 */

export interface ThrottleConfig {
  maxConcurrency: number;
  requestsPerSecond: number;
  retryDelayMs: number;
  maxRetries: number;
}

export interface TaskStatus {
  id: string;
  type: 'fetch' | 'process';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'throttled';
  progress: number;
  total: number;
  retries: number;
  lastError?: string;
  startedAt?: number;
  completedAt?: number;
}

export class APIThrottler {
  private config: ThrottleConfig;
  private queue: (() => Promise<any>)[] = [];
  private running = 0;
  private lastRequestTime = 0;
  private tasks = new Map<string, TaskStatus>();
  
  constructor(config: ThrottleConfig) {
    this.config = config;
  }
  
  /**
   * Add a task to the throttled queue
   */
  async enqueue<T>(
    taskId: string,
    taskType: 'fetch' | 'process',
    fn: () => Promise<T>,
    total: number = 1
  ): Promise<T> {
    const task: TaskStatus = {
      id: taskId,
      type: taskType,
      status: 'pending',
      progress: 0,
      total,
      retries: 0,
      startedAt: Date.now()
    };
    
    this.tasks.set(taskId, task);
    
    return new Promise((resolve, reject) => {
      const wrappedFn = async () => {
        try {
          task.status = 'running';
          const result = await this.executeWithRetry(fn, task);
          task.status = 'completed';
          task.completedAt = Date.now();
          resolve(result);
        } catch (error) {
          task.status = 'failed';
          task.lastError = error instanceof Error ? error.message : String(error);
          task.completedAt = Date.now();
          reject(error);
        }
      };
      
      this.queue.push(wrappedFn);
      this.processQueue();
    });
  }
  
  /**
   * Execute function with retry logic and rate limiting
   */
  private async executeWithRetry<T>(fn: () => Promise<T>, task: TaskStatus): Promise<T> {
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Rate limit check
        await this.waitForRateLimit();
        
        // Execute the function
        const result = await fn();
        task.progress++;
        return result;
        
      } catch (error) {
        task.retries = attempt;
        
        if (attempt === this.config.maxRetries) {
          throw error;
        }
        
        // Wait before retry with exponential backoff
        const delay = this.config.retryDelayMs * Math.pow(2, attempt);
        task.status = 'throttled';
        await new Promise(resolve => setTimeout(resolve, delay));
        task.status = 'running';
      }
    }
    
    throw new Error('Max retries exceeded');
  }
  
  /**
   * Wait to respect rate limits
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const minInterval = 1000 / this.config.requestsPerSecond;
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
  
  /**
   * Process the queue respecting concurrency limits
   */
  private async processQueue(): Promise<void> {
    if (this.running >= this.config.maxConcurrency || this.queue.length === 0) {
      return;
    }
    
    const task = this.queue.shift();
    if (!task) return;
    
    this.running++;
    
    try {
      await task();
    } finally {
      this.running--;
      this.processQueue(); // Process next task
    }
  }
  
  /**
   * Get current task statuses
   */
  getTaskStatuses(): TaskStatus[] {
    return Array.from(this.tasks.values());
  }
  
  /**
   * Get task by ID
   */
  getTask(id: string): TaskStatus | undefined {
    return this.tasks.get(id);
  }
  
  /**
   * Clear completed tasks
   */
  clearCompleted(): void {
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === 'completed' || task.status === 'failed') {
        this.tasks.delete(id);
      }
    }
  }
  
  /**
   * Get queue statistics
   */
  getStats() {
    const tasks = Array.from(this.tasks.values());
    return {
      queued: this.queue.length,
      running: this.running,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      throttled: tasks.filter(t => t.status === 'throttled').length,
      totalTasks: tasks.length,
      maxConcurrency: this.config.maxConcurrency,
      requestsPerSecond: this.config.requestsPerSecond
    };
  }
}

// Global throttler instances for different operations
export const tcgcsvThrottler = new APIThrottler({
  maxConcurrency: 3,
  requestsPerSecond: 2,
  retryDelayMs: 1000,
  maxRetries: 3
});

export const justtcgThrottler = new APIThrottler({
  maxConcurrency: 5,
  requestsPerSecond: 8, // Higher limit for JustTCG
  retryDelayMs: 500,
  maxRetries: 3
});