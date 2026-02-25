import type { ErrorStrategy } from '../types/pipeline.js';
import { CerebroError, ErrorCategory } from '../types/errors.js';

export interface ErrorStrategyConfig {
  default?: ErrorStrategy;
  perExpert?: Record<string, ErrorStrategy>;
}

export function getEffectiveStrategy(
  expertName: string,
  config?: ErrorStrategyConfig,
): ErrorStrategy {
  return config?.perExpert?.[expertName] ?? config?.default ?? { type: 'abort' };
}

export function shouldRetry(error: unknown, strategy: ErrorStrategy, attempt: number): boolean {
  if (strategy.type !== 'retry' && strategy.type !== 'circuit-breaker') return false;

  const maxRetries = strategy.maxRetries ?? 3;
  if (attempt >= maxRetries) return false;

  if (error instanceof CerebroError) {
    return error.category === ErrorCategory.TRANSIENT || error.category === ErrorCategory.RATE_LIMITED;
  }

  return true;
}

export function getRetryDelay(strategy: ErrorStrategy, attempt: number): number {
  const baseDelay = strategy.delayMs ?? 1000;
  return baseDelay * Math.pow(2, attempt);
}

export class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private readonly threshold: number;
  private readonly resetMs: number;

  constructor(threshold = 5, resetMs = 30_000) {
    this.threshold = threshold;
    this.resetMs = resetMs;
  }

  get isOpen(): boolean {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetMs) {
        this.state = 'half-open';
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  get currentState(): string {
    if (this.state === 'open' && Date.now() - this.lastFailure > this.resetMs) {
      return 'half-open';
    }
    return this.state;
  }
}
