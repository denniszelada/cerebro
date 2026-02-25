import { describe, it, expect } from 'vitest';
import { InMemoryMetrics, METRICS } from '../observability/metrics.js';
import { InMemoryTracer } from '../observability/tracing.js';

describe('InMemoryMetrics', () => {
  it('should track counters', () => {
    const metrics = new InMemoryMetrics();
    metrics.increment(METRICS.BUS_MESSAGES_PUBLISHED, { topic: 'test' });
    metrics.increment(METRICS.BUS_MESSAGES_PUBLISHED, { topic: 'test' });
    metrics.increment(METRICS.BUS_MESSAGES_PUBLISHED, { topic: 'other' });

    expect(metrics.getCounter(METRICS.BUS_MESSAGES_PUBLISHED, { topic: 'test' })).toBe(2);
    expect(metrics.getCounter(METRICS.BUS_MESSAGES_PUBLISHED, { topic: 'other' })).toBe(1);
  });

  it('should track histograms', () => {
    const metrics = new InMemoryMetrics();
    metrics.histogram(METRICS.PIPELINE_DURATION, 100);
    metrics.histogram(METRICS.PIPELINE_DURATION, 200);
    metrics.histogram(METRICS.PIPELINE_DURATION, 150);

    const values = metrics.getHistogram(METRICS.PIPELINE_DURATION);
    expect(values).toHaveLength(3);
  });

  it('should track gauges', () => {
    const metrics = new InMemoryMetrics();
    metrics.gauge(METRICS.CIRCUIT_BREAKER_STATE, 1, { expert: 'Extractor' });
    expect(metrics.getGauge(METRICS.CIRCUIT_BREAKER_STATE, { expert: 'Extractor' })).toBe(1);

    metrics.gauge(METRICS.CIRCUIT_BREAKER_STATE, 0, { expert: 'Extractor' });
    expect(metrics.getGauge(METRICS.CIRCUIT_BREAKER_STATE, { expert: 'Extractor' })).toBe(0);
  });

  it('should produce a snapshot with stats', () => {
    const metrics = new InMemoryMetrics();
    metrics.increment('requests', { status: '200' });
    metrics.increment('requests', { status: '200' });
    metrics.histogram('latency', 100);
    metrics.histogram('latency', 200);
    metrics.histogram('latency', 300);
    metrics.gauge('active', 5);

    const snap = metrics.snapshot();
    expect(snap.counters['requests{status=200}']).toBe(2);
    expect(snap.histograms['latency']?.count).toBe(3);
    expect(snap.histograms['latency']?.avg).toBe(200);
    expect(snap.gauges['active']).toBe(5);
  });

  it('should reset all metrics', () => {
    const metrics = new InMemoryMetrics();
    metrics.increment('test');
    metrics.histogram('test', 100);
    metrics.gauge('test', 1);

    metrics.reset();
    expect(metrics.getCounter('test')).toBe(0);
    expect(metrics.getHistogram('test')).toEqual([]);
    expect(metrics.getGauge('test')).toBe(0);
  });
});

describe('InMemoryTracer', () => {
  it('should create and track spans', () => {
    const tracer = new InMemoryTracer();
    const span = tracer.startSpan('test-operation');

    span.setAttribute('expert', 'Extractor');
    span.addEvent('processing_start');
    span.end();

    expect(span.name).toBe('test-operation');
    expect(span.duration).toBeGreaterThanOrEqual(0);
    expect(span.attributes['expert']).toBe('Extractor');
    expect(span.events).toHaveLength(1);

    expect(tracer.getSpans()).toHaveLength(1);
  });

  it('should support parent-child spans', () => {
    const tracer = new InMemoryTracer();
    const parent = tracer.startSpan('pipeline', { traceId: 'trace-1' });
    const child = tracer.startSpan('expert-step', {
      traceId: 'trace-1',
      parentSpanId: parent.spanId,
    });

    child.end();
    parent.end();

    const spans = tracer.getSpansByTrace('trace-1');
    expect(spans).toHaveLength(2);
    expect(spans[1]!.parentSpanId).toBe(parent.spanId);
  });

  it('should set error status', () => {
    const tracer = new InMemoryTracer();
    const span = tracer.startSpan('failing-operation');

    span.setStatus('error', 'Something went wrong');
    span.end();

    expect(span.status).toBe('error');
    expect(span.attributes['error.message']).toBe('Something went wrong');
  });
});
