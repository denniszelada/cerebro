# @cerebro/bus

Dual-mode communication bus for the Cerebro framework. Provides `LocalBus` (in-process EventEmitter, sub-millisecond), `RedisBus` (Redis Pub/Sub + Streams for distributed deployments), and `StreamSession` for real-time bidirectional participant sessions.

## Install

```bash
pnpm add @cerebro/bus
```

## Key Exports

| Export | Purpose |
|---|---|
| `createBus()` | Factory -- `'local'`, `'redis'`, or `'auto'` mode |
| `LocalBus` | In-process EventEmitter-based bus |
| `RedisBus` | Redis Pub/Sub + Streams bus |
| `StreamSession` | Managed bidirectional session between named participants |
| `IBus` | Interface for publish/subscribe/request/openStream |

## Usage

### Basic pub/sub

```ts
import { createBus } from '@cerebro/bus';

const bus = createBus({ mode: 'local' });

bus.subscribe('events.user', (envelope) => {
  console.log(envelope.payload); // { action: 'login' }
});

await bus.publish('events.user', { action: 'login' });
```

### Request / reply

```ts
bus.subscribe('math.add', async (envelope) => {
  const { a, b } = envelope.payload;
  const replyTo = envelope.metadata?.replyTo;
  if (replyTo) await bus.publish(replyTo, a + b);
});

const response = await bus.request('math.add', { a: 2, b: 3 });
console.log(response.payload); // 5
```

### StreamSession (multi-participant)

```ts
import { StreamSession } from '@cerebro/bus';

const session = new StreamSession(bus, {
  participants: ['user', 'agent'],
  idleTimeout: 30_000,
});

// Agent listens
for await (const msg of session.listen('agent')) {
  console.log('agent received:', msg);
}

// User sends
await session.send('user', 'agent', { text: 'hello' });

// Request-reply inside a session
const answer = await session.ask('user', 'agent', 'What is 2+2?');
```

### Redis mode

```ts
import Redis from 'ioredis';

const bus = createBus({
  mode: 'redis',
  redisFactory: () => new Redis({ host: 'localhost', port: 6379 }),
});
```

## More Info

See the [main Cerebro README](../../README.md) for full documentation.
