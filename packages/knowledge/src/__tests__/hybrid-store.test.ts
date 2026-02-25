import { describe, it, expect } from 'vitest';
import { HybridStore } from '../hybrid-store.js';
import type { IVectorStore, KnowledgeDomain, VectorResult } from '../types.js';

const testDomain: KnowledgeDomain = {
  domain: 'documents',
  description: 'Document types',
  entries: [
    {
      key: 'invoice',
      domain: 'documents',
      description: 'Commercial invoice for goods/services',
      fields: ['vendor', 'date', 'amount', 'currency', 'lineItems', 'taxId'],
      storage: { table: 'documents', category: 'financial' },
      extractionHints: 'Look for total amount, vendor name, date in header',
    },
    {
      key: 'contract',
      domain: 'documents',
      description: 'Legal contract or agreement between parties',
      fields: ['parties', 'startDate', 'endDate', 'terms', 'value'],
      relatedExperts: ['legalExpert'],
    },
    {
      key: 'patrimony_calculation',
      domain: 'documents',
      description: 'Fields needed to calculate patrimony',
      fields: ['realEstate', 'securities', 'lifeInsurance', 'businessStakes', 'liabilities'],
      relatedExperts: ['archimede', 'dbExpert'],
    },
  ],
};

describe('HybridStore', () => {
  it('should load domains and retrieve by key', async () => {
    const store = new HybridStore({ domains: [testDomain] });

    const entry = store.getEntry('documents', 'invoice');
    expect(entry).toBeDefined();
    expect(entry!.description).toContain('Commercial invoice');
  });

  it('should query by exact key', async () => {
    const store = new HybridStore({ domains: [testDomain] });

    const results = await store.query({ key: 'invoice' });
    expect(results).toHaveLength(1);
    expect(results[0]!.score).toBe(1.0);
    expect(results[0]!.source).toBe('yaml');
  });

  it('should query by key and domain', async () => {
    const store = new HybridStore({ domains: [testDomain] });

    const results = await store.query({ key: 'invoice', domain: 'documents' });
    expect(results).toHaveLength(1);

    const noResults = await store.query({ key: 'invoice', domain: 'nonexistent' });
    expect(noResults).toHaveLength(0);
  });

  it('should search by text', async () => {
    const store = new HybridStore({ domains: [testDomain] });

    const results = await store.search('patrimony');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.entry.key).toBe('patrimony_calculation');
  });

  it('should search by field content', async () => {
    const store = new HybridStore({ domains: [testDomain] });

    const results = await store.search('vendor');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.entry.key).toBe('invoice');
  });

  it('should learn new entries', async () => {
    const store = new HybridStore({ domains: [testDomain] });

    await store.learn({
      key: 'receipt',
      domain: 'documents',
      description: 'Purchase receipt from a store',
      fields: ['store', 'date', 'total', 'items'],
    });

    const entry = store.getEntry('documents', 'receipt');
    expect(entry).toBeDefined();
    expect(entry!.description).toContain('Purchase receipt');
  });

  it('should list domains', () => {
    const store = new HybridStore({ domains: [testDomain] });
    expect(store.getDomains()).toEqual(['documents']);
  });

  it('should fall back to vector store when YAML has no results', async () => {
    const mockVector: IVectorStore = {
      async upsert() {},
      async search(_query: string): Promise<VectorResult[]> {
        return [
          { id: 'vec-1', text: 'Found via vector search', score: 0.9, metadata: { domain: 'learned' } },
        ];
      },
      async delete() {},
    };

    const store = new HybridStore({ domains: [testDomain], vectorStore: mockVector });

    const results = await store.search('something completely unrelated to yaml entries');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.source === 'vector')).toBe(true);
  });

  it('should persist learned entries to vector store', async () => {
    const upserted: Array<{ id: string; text: string }> = [];
    const mockVector: IVectorStore = {
      async upsert(id, text) {
        upserted.push({ id, text });
      },
      async search(): Promise<VectorResult[]> {
        return [];
      },
      async delete() {},
    };

    const store = new HybridStore({ vectorStore: mockVector });

    await store.learn({
      key: 'new-fact',
      domain: 'learned',
      description: 'A dynamically learned fact',
    });

    expect(upserted).toHaveLength(1);
    expect(upserted[0]!.id).toBe('learned:new-fact');
  });
});
