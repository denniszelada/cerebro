import type { KnowledgeEntry, KnowledgeQuery, KnowledgeResult } from './types.js';

export interface IKnowledgeStore {
  query(query: KnowledgeQuery): Promise<KnowledgeResult[]>;
  search(text: string, options?: { limit?: number; threshold?: number }): Promise<KnowledgeResult[]>;
  learn(entry: KnowledgeEntry): Promise<void>;
  getDomains(): string[];
  getEntry(domain: string, key: string): KnowledgeEntry | undefined;
}
