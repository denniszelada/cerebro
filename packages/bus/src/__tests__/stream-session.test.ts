import { describe, it, expect, afterEach } from 'vitest';
import { LocalBus } from '../local-bus.js';
import { StreamSession } from '../stream-session.js';

describe('StreamSession', () => {
  let bus: LocalBus;
  let session: StreamSession;

  afterEach(async () => {
    if (session && !session.isClosed) await session.close();
    if (bus) await bus.destroy();
  });

  it('should send messages between participants', async () => {
    bus = new LocalBus();
    session = new StreamSession(bus, {
      participants: ['Alice', 'Bob'],
    });

    const messages: unknown[] = [];
    const iter = session.listen('Bob');

    await session.send('Alice', 'Bob', { text: 'Hello Bob!' });
    await new Promise((r) => setTimeout(r, 20));

    const result = await iter.next();
    expect(result.done).toBe(false);
    expect(result.value).toEqual({ text: 'Hello Bob!' });
  });

  it('should handle ask/reply pattern', async () => {
    bus = new LocalBus();
    session = new StreamSession(bus, {
      participants: ['Agent', 'Brain'],
    });

    // Brain listens and replies via the bus (simulating a real Brain handler).
    // We subscribe on the bus BEFORE creating the session, so the raw handler fires
    // alongside the session's internal handler. The session routes correlation replies.
    // The proper pattern: subscribe to the underlying bus topic to act as responder.
    const brainTopic = `session.${session.id}.Brain`;
    bus.subscribe(brainTopic, async (envelope) => {
      const replyTo = envelope.metadata?.['replyTo'] as string;
      if (replyTo && envelope.correlationId) {
        await bus.publish(replyTo, { balance: 1500 }, {
          correlationId: envelope.correlationId,
        });
      }
    });

    const answer = await session.ask('Agent', 'Brain', { query: 'balance?' }, 1000);
    expect(answer).toEqual({ balance: 1500 });
  });

  it('should throw for non-participant', () => {
    bus = new LocalBus();
    session = new StreamSession(bus, {
      participants: ['Alice', 'Bob'],
    });

    expect(() => session.listen('Charlie')).toThrow('not a participant');
  });

  it('should close and reject pending asks', async () => {
    bus = new LocalBus();
    session = new StreamSession(bus, {
      participants: ['Alice', 'Bob'],
    });

    const askPromise = session.ask('Alice', 'Bob', { q: 'hello?' }, 5000);
    await session.close();

    await expect(askPromise).rejects.toThrow('Session closed');
  });

  it('should auto-close on idle timeout', async () => {
    bus = new LocalBus();
    session = new StreamSession(bus, {
      participants: ['Alice', 'Bob'],
      idleTimeout: 50,
    });

    expect(session.isClosed).toBe(false);
    await new Promise((r) => setTimeout(r, 100));
    expect(session.isClosed).toBe(true);
  });

  it('should throw when sending on closed session', async () => {
    bus = new LocalBus();
    session = new StreamSession(bus, {
      participants: ['Alice', 'Bob'],
    });

    await session.close();
    await expect(session.send('Alice', 'Bob', 'hi')).rejects.toThrow('closed');
  });
});
