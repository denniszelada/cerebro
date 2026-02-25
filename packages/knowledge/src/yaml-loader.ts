import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { parse } from 'yaml';
import type { KnowledgeDomain, KnowledgeEntry } from './types.js';

export interface YamlKnowledgeFile {
  domain: string;
  description?: string;
  entries: Array<{
    key: string;
    description: string;
    fields?: string[];
    storage?: Record<string, unknown>;
    extractionHints?: string;
    relatedExperts?: string[];
    metadata?: Record<string, unknown>;
  }>;
}

export function loadYamlKnowledge(dirPath: string): KnowledgeDomain[] {
  const domains: KnowledgeDomain[] = [];

  let files: string[];
  try {
    files = readdirSync(dirPath);
  } catch {
    return domains;
  }

  for (const file of files) {
    const ext = extname(file);
    if (ext !== '.yaml' && ext !== '.yml') continue;

    const filePath = join(dirPath, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = parse(content) as YamlKnowledgeFile;

      if (!parsed?.domain || !Array.isArray(parsed.entries)) continue;

      const entries: KnowledgeEntry[] = parsed.entries.map((e) => ({
        key: e.key,
        domain: parsed.domain,
        description: e.description,
        fields: e.fields,
        storage: e.storage,
        extractionHints: e.extractionHints,
        relatedExperts: e.relatedExperts,
        metadata: e.metadata,
      }));

      domains.push({
        domain: parsed.domain,
        description: parsed.description,
        entries,
      });
    } catch {
      // Skip invalid YAML files
    }
  }

  return domains;
}

export function loadYamlFile(filePath: string): KnowledgeDomain | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parse(content) as YamlKnowledgeFile;

    if (!parsed?.domain || !Array.isArray(parsed.entries)) return null;

    const entries: KnowledgeEntry[] = parsed.entries.map((e) => ({
      key: e.key,
      domain: parsed.domain,
      description: e.description,
      fields: e.fields,
      storage: e.storage,
      extractionHints: e.extractionHints,
      relatedExperts: e.relatedExperts,
      metadata: e.metadata,
    }));

    return {
      domain: parsed.domain,
      description: parsed.description,
      entries,
    };
  } catch {
    return null;
  }
}
