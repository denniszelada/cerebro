import type {
  IKnowledgeStore,
} from './store.interface.js';
import type {
  IVectorStore,
  KnowledgeDomain,
  KnowledgeEntry,
  KnowledgeQuery,
  KnowledgeResult,
} from './types.js';

export interface HybridStoreOptions {
  domains?: KnowledgeDomain[];
  vectorStore?: IVectorStore;
}

export class HybridStore implements IKnowledgeStore {
  private readonly domainMap = new Map<string, Map<string, KnowledgeEntry>>();
  private readonly allEntries: KnowledgeEntry[] = [];
  private readonly vectorStore?: IVectorStore;

  constructor(options: HybridStoreOptions = {}) {
    this.vectorStore = options.vectorStore;

    if (options.domains) {
      for (const domain of options.domains) {
        this.addDomain(domain);
      }
    }
  }

  addDomain(domain: KnowledgeDomain): void {
    let entryMap = this.domainMap.get(domain.domain);
    if (!entryMap) {
      entryMap = new Map();
      this.domainMap.set(domain.domain, entryMap);
    }

    for (const entry of domain.entries) {
      entryMap.set(entry.key, entry);
      this.allEntries.push(entry);
    }
  }

  async query(query: KnowledgeQuery): Promise<KnowledgeResult[]> {
    const results: KnowledgeResult[] = [];

    // Exact key lookup (O(1))
    if (query.key) {
      if (query.domain) {
        const entry = this.getEntry(query.domain, query.key);
        if (entry) {
          results.push({ entry, score: 1.0, source: 'yaml' });
        }
      } else {
        // Search across all domains
        for (const [, entryMap] of this.domainMap) {
          const entry = entryMap.get(query.key);
          if (entry) {
            results.push({ entry, score: 1.0, source: 'yaml' });
          }
        }
      }
    }

    // Text search in YAML entries (simple keyword matching)
    if (query.text && results.length === 0) {
      const textLower = query.text.toLowerCase();
      const limit = query.limit ?? 10;

      const scored: Array<{ entry: KnowledgeEntry; score: number }> = [];

      for (const entry of this.allEntries) {
        if (query.domain && entry.domain !== query.domain) continue;

        let score = 0;
        const desc = entry.description.toLowerCase();
        const key = entry.key.toLowerCase();

        if (key === textLower) score += 1.0;
        else if (key.includes(textLower)) score += 0.8;
        if (desc.includes(textLower)) score += 0.5;

        if (entry.fields) {
          for (const field of entry.fields) {
            if (field.toLowerCase().includes(textLower)) {
              score += 0.3;
              break;
            }
          }
        }

        if (score > 0) {
          scored.push({ entry, score: Math.min(score, 1.0) });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      for (const item of scored.slice(0, limit)) {
        results.push({ entry: item.entry, score: item.score, source: 'yaml' });
      }
    }

    // Fall back to vector search if available and not enough results
    if (query.text && this.vectorStore && results.length < (query.limit ?? 10)) {
      const vectorResults = await this.vectorStore.search(query.text, {
        limit: (query.limit ?? 10) - results.length,
        threshold: query.threshold,
      });

      for (const vr of vectorResults) {
        const entry: KnowledgeEntry = {
          key: vr.id,
          domain: (vr.metadata['domain'] as string) ?? 'vector',
          description: vr.text,
          metadata: vr.metadata,
        };
        results.push({ entry, score: vr.score, source: 'vector' });
      }
    }

    return results;
  }

  async search(
    text: string,
    options?: { limit?: number; threshold?: number },
  ): Promise<KnowledgeResult[]> {
    return this.query({ text, limit: options?.limit, threshold: options?.threshold });
  }

  async learn(entry: KnowledgeEntry): Promise<void> {
    // Add to in-memory store
    let entryMap = this.domainMap.get(entry.domain);
    if (!entryMap) {
      entryMap = new Map();
      this.domainMap.set(entry.domain, entryMap);
    }
    entryMap.set(entry.key, entry);
    this.allEntries.push(entry);

    // Also persist to vector store if available
    if (this.vectorStore) {
      await this.vectorStore.upsert(
        `${entry.domain}:${entry.key}`,
        `${entry.description} ${entry.fields?.join(' ') ?? ''}`,
        { domain: entry.domain, key: entry.key, ...entry.metadata },
      );
    }
  }

  getDomains(): string[] {
    return [...this.domainMap.keys()];
  }

  getEntry(domain: string, key: string): KnowledgeEntry | undefined {
    return this.domainMap.get(domain)?.get(key);
  }
}
