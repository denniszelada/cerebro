import { describe, it, expect, afterEach } from 'vitest';
import { LocalBus } from '../local-bus.js';
import type { BusEnvelope } from '../types.js';

describe('LocalBus', () => {
  let bus: LocalBus;

  afterEach(async () => {
    if (bus) await bus.destroy();
  });

  it('should publish and subscribe to a topic', async () => {
    bus = new LocalBus();
    const received: BusEnvelope[] = [];

    bus.subscribe('test.topic', (envelope) => {
      received.push(envelope);
    });

    await bus.publish('test.topic', { hello: 'world' });

    // setImmediate dispatch - wait a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toEqual({ hello: 'world' });
  });

  it('should support wildcard subscriptions', async () => {
    bus = new LocalBus();
    const received: BusEnvelope[] = [];

    bus.subscribe('expert.*', (envelope) => {
      received.push(envelope);
    });

    await bus.publish('expert.classifier', { type: 'classify' });
    await bus.publish('expert.extractor', { type: 'extract' });
    await bus.publish('other.topic', { type: 'other' });

    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(2);
  });

  it('should support unsubscribe', async () => {
    bus = new LocalBus();
    const received: BusEnvelope[] = [];

    const unsub = bus.subscribe('test', (envelope) => {
      received.push(envelope);
    });

    await bus.publish('test', 'first');
    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(1);

    unsub();
    await bus.publish('test', 'second');
    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(1);
  });

  it('should handle request-response', async () => {
    bus = new LocalBus();

    bus.subscribe('question', (envelope) => {
      const replyTo = envelope.metadata?.['replyTo'] as string;
      if (replyTo) {
        void bus.publish(replyTo, { answer: 42 }, {
          correlationId: envelope.correlationId,
        });
      }
    });

    const response = await bus.request('question', { q: 'meaning of life' }, { timeout: 1000 });
    expect(response.payload).toEqual({ answer: 42 });
  });

  it('should timeout on request if no reply', async () => {
    bus = new LocalBus();

    await expect(
      bus.request('no-one-listening', { q: 'hello?' }, { timeout: 50 }),
    ).rejects.toThrow('Request timeout');
  });

  it('should throw after destroy', async () => {
    bus = new LocalBus();
    await bus.destroy();

    expect(() => bus.subscribe('test', () => {})).toThrow('destroyed');
    await expect(bus.publish('test', {})).rejects.toThrow('destroyed');
  });

  it('should apply subscribe filter', async () => {
    bus = new LocalBus();
    const received: BusEnvelope[] = [];

    bus.subscribe('test', (envelope) => {
      received.push(envelope);
    }, {
      filter: (env) => (env.payload as { important?: boolean }).important === true,
    });

    await bus.publish('test', { important: true, msg: 'yes' });
    await bus.publish('test', { important: false, msg: 'no' });

    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(1);
    expect((received[0]!.payload as { msg: string }).msg).toBe('yes');
  });
});
