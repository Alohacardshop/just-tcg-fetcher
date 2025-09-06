/**
 * API Limits Tracker - Monitor and log JustTCG API usage
 * 
 * Helps tune concurrency based on Enterprise limits:
 * - 500 requests per minute
 * - 50,000 requests per day  
 * - 500,000 requests per month
 */

interface APILimits {
  rpm: number; // requests per minute
  daily: number; // requests per day
  monthly: number; // requests per month
}

interface UsageStats {
  requestsThisMinute: number;
  requestsToday: number;
  requestsThisMonth: number;
  lastRequestTime: number;
  lastMinuteReset: number;
  lastDayReset: number;
  lastMonthReset: number;
}

class APILimitsTracker {
  private limits: APILimits = {
    rpm: 500,    // Enterprise: 500 rpm
    daily: 50000, // Enterprise: 50k/day  
    monthly: 500000 // Enterprise: 500k/month
  };
  
  private usage: UsageStats = {
    requestsThisMinute: 0,
    requestsToday: 0, 
    requestsThisMonth: 0,
    lastRequestTime: 0,
    lastMinuteReset: Date.now(),
    lastDayReset: Date.now(),
    lastMonthReset: Date.now()
  };

  /**
   * Log a request and check if we're approaching limits
   */
  trackRequest(): void {
    const now = Date.now();
    this.resetCountersIfNeeded(now);
    
    this.usage.requestsThisMinute++;
    this.usage.requestsToday++;
    this.usage.requestsThisMonth++;
    this.usage.lastRequestTime = now;
    
    this.logUsageWarnings();
  }

  /**
   * Reset counters when time windows roll over
   */
  private resetCountersIfNeeded(now: number): void {
    // Reset minute counter
    if (now - this.usage.lastMinuteReset > 60000) {
      this.usage.requestsThisMinute = 0;
      this.usage.lastMinuteReset = now;
    }
    
    // Reset daily counter  
    if (now - this.usage.lastDayReset > 86400000) {
      this.usage.requestsToday = 0;
      this.usage.lastDayReset = now;
    }
    
    // Reset monthly counter (approximate 30 days)
    if (now - this.usage.lastMonthReset > 2592000000) {
      this.usage.requestsThisMonth = 0;
      this.usage.lastMonthReset = now;
    }
  }

  /**
   * Log warnings when approaching limits
   */
  private logUsageWarnings(): void {
    const rpmUsage = (this.usage.requestsThisMinute / this.limits.rpm) * 100;
    const dailyUsage = (this.usage.requestsToday / this.limits.daily) * 100;
    const monthlyUsage = (this.usage.requestsThisMonth / this.limits.monthly) * 100;
    
    // Log current usage
    console.log(`📊 API Usage - RPM: ${this.usage.requestsThisMinute}/${this.limits.rpm} (${rpmUsage.toFixed(1)}%), Daily: ${this.usage.requestsToday}/${this.limits.daily} (${dailyUsage.toFixed(1)}%), Monthly: ${this.usage.requestsThisMonth}/${this.limits.monthly} (${monthlyUsage.toFixed(1)}%)`);
    
    // Warn when approaching limits
    if (rpmUsage > 80) {
      console.warn(`⚠️ RPM limit warning: ${rpmUsage.toFixed(1)}% used (${this.usage.requestsThisMinute}/${this.limits.rpm})`);
    }
    
    if (dailyUsage > 80) {
      console.warn(`⚠️ Daily limit warning: ${dailyUsage.toFixed(1)}% used (${this.usage.requestsToday}/${this.limits.daily})`);
    }
    
    if (monthlyUsage > 80) {
      console.warn(`⚠️ Monthly limit warning: ${monthlyUsage.toFixed(1)}% used (${this.usage.requestsThisMonth}/${this.limits.monthly})`);
    }
  }

  /**
   * Check if we should throttle requests
   */
  shouldThrottle(): { throttle: boolean; reason?: string; waitMs?: number } {
    const now = Date.now();
    this.resetCountersIfNeeded(now);
    
    // Check RPM limit (most restrictive)
    if (this.usage.requestsThisMinute >= this.limits.rpm * 0.9) {
      const nextMinute = this.usage.lastMinuteReset + 60000;
      const waitMs = Math.max(0, nextMinute - now);
      return {
        throttle: true,
        reason: 'Approaching RPM limit',
        waitMs
      };
    }
    
    return { throttle: false };
  }

  /**
   * Get current usage stats
   */
  getUsageStats(): UsageStats & { limits: APILimits } {
    const now = Date.now();
    this.resetCountersIfNeeded(now);
    
    return {
      ...this.usage,
      limits: this.limits
    };
  }
}

// Global instance
export const apiLimitsTracker = new APILimitsTracker();

/**
 * Wrapper function to track API calls
 */
export function trackApiRequest(): void {
  apiLimitsTracker.trackRequest();
}

/**
 * Check if request should be throttled
 */
export function checkThrottleStatus(): { throttle: boolean; reason?: string; waitMs?: number } {
  return apiLimitsTracker.shouldThrottle();
}

/**
 * Get comprehensive usage statistics
 */
export function getApiUsageStats(): UsageStats & { limits: APILimits } {
  return apiLimitsTracker.getUsageStats();
}