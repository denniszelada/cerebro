export interface KnowledgeEntry {
  key: string;
  domain: string;
  description: string;
  fields?: string[];
  storage?: Record<string, unknown>;
  extractionHints?: string;
  relatedExperts?: string[];
  metadata?: Record<string, unknown>;
}

export interface KnowledgeDomain {
  domain: string;
  description?: string;
  entries: KnowledgeEntry[];
}

export interface KnowledgeQuery {
  key?: string;
  domain?: string;
  text?: string;
  limit?: number;
  threshold?: number;
}

export interface KnowledgeResult {
  entry: KnowledgeEntry;
  score: number;
  source: 'yaml' | 'vector';
}

export interface VectorResult {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface IVectorStore {
  upsert(id: string, text: string, metadata: Record<string, unknown>): Promise<void>;
  search(query: string, options?: { limit?: number; threshold?: number }): Promise<VectorResult[]>;
  delete(id: string): Promise<void>;
}
