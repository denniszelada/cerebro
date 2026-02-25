/**
 * Vendelo CRM Integration Example
 *
 * Demonstrates a CRM/Sales agent scenario:
 * - WhatsApp message → Brain → parallel(IntegrationExpert, CustomerServiceExpert) → reply
 * - IntegrationExpert fetches customer data from CRM
 * - CustomerServiceExpert generates a personalized response using customer context
 */

import { LocalBus } from '@cerebro/bus';
import {
  Expert,
  Pipeline,
  PipelineExecutor,
  createExecutionContext,
} from '@cerebro/core';
import type { ExpertTask, ExpertResult, ExecutionContext } from '@cerebro/core';

// ─── Simulated CRM Service ──────────────────────────────────────────────────
const crmDatabase: Record<string, { name: string; plan: string; lastPurchase: string; balance: number }> = {
  'customer-456': {
    name: 'Maria Santos',
    plan: 'Premium',
    lastPurchase: '2026-02-10',
    balance: 2450.00,
  },
  'customer-789': {
    name: 'Jean Dupont',
    plan: 'Basic',
    lastPurchase: '2026-01-28',
    balance: 150.00,
  },
};

// ─── Integration Expert ──────────────────────────────────────────────────────
class IntegrationExpert extends Expert {
  readonly name = 'IntegrationExpert';
  readonly domain = 'crm';
  readonly capabilities = ['fetch_customer', 'fetch_orders', 'fetch_inventory'];
  readonly description = 'Fetches data from CRM, orders, and inventory systems';

  async process(task: ExpertTask, _context: ExecutionContext): Promise<ExpertResult> {
    console.log(`  [IntegrationExpert] Fetching customer data...`);
    const customerId = (task.data?.['customerId'] as string) ?? 'customer-456';
    const customer = crmDatabase[customerId];

    return {
      type: 'customer_data',
      data: customer ?? { error: 'Customer not found' },
      expertName: this.name,
      duration: 45,
    };
  }
}

// ─── Customer Service Expert ─────────────────────────────────────────────────
class CustomerServiceExpert extends Expert {
  readonly name = 'CustomerServiceExpert';
  readonly domain = 'communication';
  readonly capabilities = ['reply', 'notify', 'escalate'];
  readonly description = 'Generates customer-facing responses using context';

  async process(task: ExpertTask, context: ExecutionContext): Promise<ExpertResult> {
    console.log(`  [CustomerServiceExpert] Generating response...`);

    // Get customer data from parallel execution
    const customerData = context.getStepResult<ExpertResult>('IntegrationExpert');
    const data = customerData?.data as Record<string, unknown> | undefined;

    const customerName = data?.name ?? 'Customer';
    const plan = data?.plan ?? 'Unknown';
    const balance = data?.balance ?? 0;

    const reply = `Hello ${customerName}! As a ${plan} member, your current balance is €${balance}. How can I help you today?`;

    return {
      type: 'response',
      data: {
        reply,
        channel: 'whatsapp',
        sentiment: 'positive',
        suggestedActions: ['view_orders', 'contact_support', 'upgrade_plan'],
      },
      expertName: this.name,
      duration: 120,
    };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Vendelo CRM Agent Example ===\n');

  const bus = new LocalBus();

  // Register experts
  const integrationExpert = new IntegrationExpert();
  const customerServiceExpert = new CustomerServiceExpert();
  integrationExpert.register(bus);
  customerServiceExpert.register(bus);

  // Build pipeline: parallel fetch + response generation
  const pipeline = Pipeline.parallel(
    Pipeline.from('IntegrationExpert', {
      instruction: 'Fetch customer data',
    }),
    Pipeline.from('CustomerServiceExpert', {
      instruction: 'Generate response',
    }),
  ).merge().build('VendeloCustomerQuery');

  console.log(`Pipeline: ${pipeline.name}`);
  console.log(`Strategy: parallel → merge\n`);

  // Simulate WhatsApp message
  const executor = new PipelineExecutor({ bus });
  const context = createExecutionContext(
    { source: 'whatsapp', sessionId: 'wa-session-123' },
    { customerId: 'customer-456', channel: 'whatsapp' },
  );

  console.log('Incoming WhatsApp message: "What is my balance?"');
  console.log('Processing...\n');

  const { result, trace } = await executor.execute(pipeline, context);

  console.log('\n--- Pipeline Trace ---');
  console.log(`Status: ${trace.status}`);
  console.log(`Duration: ${trace.duration}ms`);
  console.log(`Steps: ${trace.root.children?.length ?? 1}`);

  console.log('\n--- Results ---');
  const results = result as ExpertResult[];
  for (const r of results) {
    console.log(`\n${r.expertName}:`);
    console.log(JSON.stringify(r.data, null, 2));
  }

  await bus.destroy();
}

main().catch(console.error);
