export interface Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly startTime: number;
  endTime?: number;
  duration?: number;
  status: 'ok' | 'error';
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];

  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
  setStatus(status: 'ok' | 'error', message?: string): void;
  setAttribute(key: string, value: string | number | boolean): void;
  end(): void;
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, string | number | boolean>;
}

export interface Tracer {
  startSpan(name: string, options?: { parentSpanId?: string; traceId?: string }): Span;
}

function generateId(): string {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

class InMemorySpan implements Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly startTime: number;
  endTime?: number;
  duration?: number;
  status: 'ok' | 'error' = 'ok';
  attributes: Record<string, string | number | boolean> = {};
  events: SpanEvent[] = [];

  constructor(name: string, traceId: string, parentSpanId?: string) {
    this.name = name;
    this.traceId = traceId;
    this.spanId = generateId();
    this.parentSpanId = parentSpanId;
    this.startTime = Date.now();
  }

  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    this.events.push({ name, timestamp: Date.now(), attributes });
  }

  setStatus(status: 'ok' | 'error', message?: string): void {
    this.status = status;
    if (message) {
      this.attributes['error.message'] = message;
    }
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes[key] = value;
  }

  end(): void {
    this.endTime = Date.now();
    this.duration = this.endTime - this.startTime;
  }
}

export class InMemoryTracer implements Tracer {
  readonly spans: Span[] = [];

  startSpan(name: string, options?: { parentSpanId?: string; traceId?: string }): Span {
    const traceId = options?.traceId ?? generateId();
    const span = new InMemorySpan(name, traceId, options?.parentSpanId);
    this.spans.push(span);
    return span;
  }

  getSpans(): Span[] {
    return [...this.spans];
  }

  getSpansByTrace(traceId: string): Span[] {
    return this.spans.filter((s) => s.traceId === traceId);
  }

  clear(): void {
    this.spans.length = 0;
  }
}

export class NoopTracer implements Tracer {
  startSpan(name: string, options?: { parentSpanId?: string; traceId?: string }): Span {
    return new InMemorySpan(name, options?.traceId ?? 'noop', options?.parentSpanId);
  }
}
