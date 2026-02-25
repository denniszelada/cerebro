export interface MetricsCollector {
  increment(name: string, labels?: Record<string, string>): void;
  histogram(name: string, value: number, labels?: Record<string, string>): void;
  gauge(name: string, value: number, labels?: Record<string, string>): void;
}

export class InMemoryMetrics implements MetricsCollector {
  private readonly counters = new Map<string, number>();
  private readonly histograms = new Map<string, number[]>();
  private readonly gauges = new Map<string, number>();

  increment(name: string, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  histogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    this.histograms.set(key, values);
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    this.gauges.set(key, value);
  }

  getCounter(name: string, labels?: Record<string, string>): number {
    return this.counters.get(this.buildKey(name, labels)) ?? 0;
  }

  getHistogram(name: string, labels?: Record<string, string>): number[] {
    return this.histograms.get(this.buildKey(name, labels)) ?? [];
  }

  getGauge(name: string, labels?: Record<string, string>): number {
    return this.gauges.get(this.buildKey(name, labels)) ?? 0;
  }

  snapshot(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, { count: number; sum: number; avg: number; p50: number; p99: number }>;
  } {
    const histogramStats: Record<string, { count: number; sum: number; avg: number; p50: number; p99: number }> = {};

    for (const [key, values] of this.histograms) {
      const sorted = [...values].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      histogramStats[key] = {
        count: sorted.length,
        sum,
        avg: sorted.length > 0 ? sum / sorted.length : 0,
        p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
        p99: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
      };
    }

    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: histogramStats,
    };
  }

  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }

  private buildKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }
}

// Standard Cerebro metric names
export const METRICS = {
  BUS_MESSAGES_PUBLISHED: 'cerebro.bus.messages.published',
  BUS_MESSAGES_RECEIVED: 'cerebro.bus.messages.received',
  BUS_REQUEST_DURATION: 'cerebro.bus.request.duration_ms',
  PIPELINE_DURATION: 'cerebro.pipeline.duration_ms',
  PIPELINE_STEP_DURATION: 'cerebro.pipeline.step.duration_ms',
  PIPELINE_ERRORS: 'cerebro.pipeline.errors',
  PIPELINE_RETRIES: 'cerebro.pipeline.retries',
  EXPERT_PROCESS_DURATION: 'cerebro.expert.process.duration_ms',
  EXPERT_ERRORS: 'cerebro.expert.errors',
  CIRCUIT_BREAKER_STATE: 'cerebro.circuit_breaker.state',
  LLM_REQUEST_DURATION: 'cerebro.llm.request.duration_ms',
  LLM_TOKENS_USED: 'cerebro.llm.tokens.used',
} as const;

export class NoopMetrics implements MetricsCollector {
  increment(): void {}
  histogram(): void {}
  gauge(): void {}
}
