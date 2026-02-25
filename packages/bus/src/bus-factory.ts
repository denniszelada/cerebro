import type { IBus } from './bus.interface.js';
import { LocalBus } from './local-bus.js';
import { RedisBus, type RedisConfig } from './redis-bus.js';

export interface BusFactoryOptions {
  mode: 'auto' | 'local' | 'redis';
  redis?: RedisConfig;
  redisFactory?: () => unknown;
}

export function createBus(options: BusFactoryOptions = { mode: 'local' }): IBus {
  switch (options.mode) {
    case 'local':
      return new LocalBus();

    case 'redis': {
      if (!options.redisFactory) {
        throw new Error(
          'Redis mode requires a redisFactory function. Install ioredis and provide: () => new Redis(config)',
        );
      }
      return new RedisBus(options.redisFactory as () => ReturnType<typeof Object>, options.redis);
    }

    case 'auto': {
      if (options.redisFactory) {
        try {
          return new RedisBus(
            options.redisFactory as () => ReturnType<typeof Object>,
            options.redis,
          );
        } catch {
          console.warn('[Cerebro] Redis unavailable, falling back to LocalBus');
          return new LocalBus();
        }
      }
      return new LocalBus();
    }

    default:
      throw new Error(`Unknown bus mode: ${options.mode as string}`);
  }
}
