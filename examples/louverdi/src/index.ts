/**
 * Louverdi Wealth Management Integration Example
 *
 * Demonstrates a document intelligence pipeline:
 * - New document → chain(Extractor → Classifier → GuidelineCreator)
 * - DocumentExtractor: OCR/extraction via Phoenix-like service
 * - DocumentClassifier: Categorizes document type
 * - GuidelineCreator: Creates processing guidelines based on document type
 */

import { LocalBus } from '@cerebro/bus';
import {
  Expert,
  Pipeline,
  PipelineExecutor,
  createExecutionContext,
} from '@cerebro/core';
import type { ExpertTask, ExpertResult, ExecutionContext } from '@cerebro/core';
import { HybridStore } from '@cerebro/knowledge';

// ─── Document Extractor Expert ───────────────────────────────────────────────
class DocumentExtractorExpert extends Expert {
  readonly name = 'DocumentExtractor';
  readonly domain = 'documents';
  readonly capabilities = ['extract', 'ocr'];
  readonly description = 'Extracts structured data from documents using OCR/AI';

  async process(task: ExpertTask, _context: ExecutionContext): Promise<ExpertResult> {
    console.log(`  [DocumentExtractor] Processing document...`);

    // Simulate Phoenix-like extraction
    return {
      type: 'extraction',
      data: {
        documentId: task.data?.['documentId'] ?? 'doc-001',
        fields: {
          type: 'patrimony_statement',
          client: 'Jean-Pierre Martin',
          realEstate: [
            { address: '15 Rue de Rivoli, Paris', value: 850000 },
            { address: '8 Av. des Champs-Élysées, Paris', value: 1200000 },
          ],
          securities: [
            { name: 'CAC 40 ETF', value: 250000 },
            { name: 'Euro Bonds', value: 180000 },
          ],
          lifeInsurance: { provider: 'AXA', value: 500000 },
          businessStakes: [],
          liabilities: [
            { type: 'mortgage', remaining: 320000 },
          ],
        },
        confidence: 0.92,
        processingTime: 3200,
      },
      expertName: this.name,
      duration: 3200,
    };
  }
}

// ─── Document Classifier Expert ──────────────────────────────────────────────
class DocumentClassifierExpert extends Expert {
  readonly name = 'DocumentClassifier';
  readonly domain = 'documents';
  readonly capabilities = ['classify', 'categorize'];
  readonly description = 'Classifies document type and determines processing rules';

  async process(task: ExpertTask, context: ExecutionContext): Promise<ExpertResult> {
    console.log(`  [DocumentClassifier] Classifying document...`);

    const extraction = context.getStepResult<ExpertResult>('DocumentExtractor');
    const fields = (extraction?.data as Record<string, unknown>)?.fields as Record<string, unknown> | undefined;
    const docType = fields?.type as string | undefined;

    return {
      type: 'classification',
      data: {
        category: 'wealth_management',
        documentType: docType ?? 'unknown',
        regulatoryFramework: 'MiFID II',
        requiredValidations: ['patrimony_calculation', 'risk_assessment', 'compliance_check'],
        priority: 'high',
      },
      expertName: this.name,
      duration: 150,
    };
  }
}

// ─── Guideline Creator Expert ────────────────────────────────────────────────
class GuidelineCreatorExpert extends Expert {
  readonly name = 'GuidelineCreator';
  readonly domain = 'compliance';
  readonly capabilities = ['guidelines', 'rules', 'validation'];
  readonly description = 'Creates processing guidelines based on document classification';

  async process(task: ExpertTask, context: ExecutionContext): Promise<ExpertResult> {
    console.log(`  [GuidelineCreator] Creating guidelines...`);

    const extraction = context.getStepResult<ExpertResult>('DocumentExtractor');
    const classification = context.getStepResult<ExpertResult>('DocumentClassifier');

    const fields = (extraction?.data as Record<string, unknown>)?.fields as Record<string, unknown> | undefined;
    const classData = classification?.data as Record<string, unknown> | undefined;

    // Calculate total patrimony
    const realEstate = (fields?.realEstate as Array<{ value: number }>) ?? [];
    const securities = (fields?.securities as Array<{ value: number }>) ?? [];
    const lifeInsurance = (fields?.lifeInsurance as { value: number }) ?? { value: 0 };
    const liabilities = (fields?.liabilities as Array<{ remaining: number }>) ?? [];

    const totalAssets =
      realEstate.reduce((sum, r) => sum + r.value, 0) +
      securities.reduce((sum, s) => sum + s.value, 0) +
      lifeInsurance.value;
    const totalLiabilities = liabilities.reduce((sum, l) => sum + l.remaining, 0);
    const netPatrimony = totalAssets - totalLiabilities;

    return {
      type: 'guidelines',
      data: {
        patrimonyCalculation: {
          totalAssets,
          totalLiabilities,
          netPatrimony,
          currency: 'EUR',
        },
        guidelines: [
          `Document type: ${classData?.documentType ?? 'unknown'}`,
          `Regulatory framework: ${classData?.regulatoryFramework ?? 'unknown'}`,
          `Net patrimony: €${netPatrimony.toLocaleString()}`,
          netPatrimony > 1_000_000
            ? 'Client qualifies as High Net Worth Individual (HNWI)'
            : 'Standard wealth management guidelines apply',
          'Required: patrimony review meeting within 30 days',
        ],
        nextSteps: ['schedule_review', 'risk_assessment', 'investment_proposal'],
      },
      expertName: this.name,
      duration: 200,
    };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Louverdi Wealth Management Example ===\n');

  const bus = new LocalBus();

  // Knowledge store with domain knowledge
  const knowledge = new HybridStore({
    domains: [
      {
        domain: 'documents',
        entries: [
          {
            key: 'patrimony_statement',
            domain: 'documents',
            description: 'Client patrimony/wealth statement',
            fields: ['realEstate', 'securities', 'lifeInsurance', 'businessStakes', 'liabilities'],
            relatedExperts: ['DocumentExtractor', 'GuidelineCreator'],
          },
        ],
      },
    ],
  });

  // Register experts
  const extractor = new DocumentExtractorExpert();
  const classifier = new DocumentClassifierExpert();
  const guidelineCreator = new GuidelineCreatorExpert();

  extractor.register(bus);
  classifier.register(bus);
  guidelineCreator.register(bus);

  // Build pipeline: chain(Extractor → Classifier → GuidelineCreator)
  const pipeline = Pipeline.from('DocumentExtractor', {
    instruction: 'Extract all fields from the patrimony document',
  })
    .then(
      Pipeline.from('DocumentClassifier', {
        instruction: 'Classify the document and determine processing rules',
      }),
    )
    .then(
      Pipeline.from('GuidelineCreator', {
        instruction: 'Create processing guidelines and calculate patrimony',
      }),
    )
    .build('LouverdiDocumentPipeline');

  console.log(`Pipeline: ${pipeline.name}`);
  console.log(`Strategy: chain (Extract → Classify → Guidelines)\n`);

  // Simulate new document arrival
  const executor = new PipelineExecutor({ bus });
  const context = createExecutionContext(
    { source: 'webhook', tenantId: 'louverdi-prod' },
    { documentId: 'doc-001', clientId: 'client-martin' },
  );

  console.log('New document received: patrimony_statement (doc-001)');
  console.log('Processing...\n');

  const { result, trace } = await executor.execute(pipeline, context);

  console.log('\n--- Pipeline Trace ---');
  console.log(`Status: ${trace.status}`);
  console.log(`Duration: ${trace.duration}ms`);

  if (trace.root.type === 'chain' && trace.root.children) {
    for (const step of trace.root.children) {
      console.log(`  ${step.expertName}: ${step.status} (${step.duration}ms, attempts: ${step.attempts})`);
    }
  }

  console.log('\n--- Final Result (Guidelines) ---');
  const guidelines = result as ExpertResult;
  console.log(JSON.stringify(guidelines.data, null, 2));

  // Demonstrate knowledge query
  console.log('\n--- Knowledge Query ---');
  const results = await knowledge.search('patrimony');
  console.log(`Found ${results.length} entries for "patrimony":`);
  for (const r of results) {
    console.log(`  - ${r.entry.key} (score: ${r.score}): ${r.entry.description}`);
  }

  await bus.destroy();
}

main().catch(console.error);
