import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { IBus } from '@denniszelada/cerebro-bus';
import type { Gateway, Brain } from '@denniszelada/cerebro-core';
import type { GatewayInput, GatewayOutput } from '@denniszelada/cerebro-core';
import { CEREBRO_BUS, CEREBRO_BRAIN, CEREBRO_GATEWAY } from './constants.js';

@Injectable()
export class CerebroService implements OnModuleDestroy {
  constructor(
    @Inject(CEREBRO_GATEWAY) private readonly gateway: Gateway,
    @Inject(CEREBRO_BRAIN) private readonly brain: Brain,
    @Inject(CEREBRO_BUS) private readonly bus: IBus,
  ) {}

  async process(input: GatewayInput): Promise<GatewayOutput> {
    return this.gateway.process(input);
  }

  getGateway(): Gateway {
    return this.gateway;
  }

  getBrain(): Brain {
    return this.brain;
  }

  getBus(): IBus {
    return this.bus;
  }

  async onModuleDestroy(): Promise<void> {
    await this.bus.destroy();
  }
}
