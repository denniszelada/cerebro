import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadYamlKnowledge, loadYamlFile } from '../yaml-loader.js';

describe('YAML Loader', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `cerebro-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should load YAML knowledge files from a directory', () => {
    writeFileSync(
      join(testDir, 'documents.yaml'),
      `domain: documents
entries:
  - key: invoice
    description: "Commercial invoice for goods/services"
    fields: [vendor, date, amount]
  - key: contract
    description: "Legal contract"
    fields: [parties, terms]
`,
    );

    const domains = loadYamlKnowledge(testDir);
    expect(domains).toHaveLength(1);
    expect(domains[0]!.domain).toBe('documents');
    expect(domains[0]!.entries).toHaveLength(2);
    expect(domains[0]!.entries[0]!.key).toBe('invoice');
    expect(domains[0]!.entries[0]!.fields).toEqual(['vendor', 'date', 'amount']);
  });

  it('should load multiple YAML files', () => {
    writeFileSync(
      join(testDir, 'docs.yaml'),
      `domain: documents
entries:
  - key: invoice
    description: "Invoice"
`,
    );

    writeFileSync(
      join(testDir, 'crm.yml'),
      `domain: crm
entries:
  - key: customer
    description: "Customer record"
    fields: [name, email]
`,
    );

    const domains = loadYamlKnowledge(testDir);
    expect(domains).toHaveLength(2);
    expect(domains.map((d) => d.domain).sort()).toEqual(['crm', 'documents']);
  });

  it('should skip non-YAML files', () => {
    writeFileSync(join(testDir, 'readme.md'), '# Not YAML');
    writeFileSync(
      join(testDir, 'valid.yaml'),
      `domain: test
entries:
  - key: item
    description: "Test item"
`,
    );

    const domains = loadYamlKnowledge(testDir);
    expect(domains).toHaveLength(1);
  });

  it('should skip malformed YAML files', () => {
    writeFileSync(join(testDir, 'bad.yaml'), 'not: valid: yaml: :::');
    writeFileSync(
      join(testDir, 'good.yaml'),
      `domain: test
entries:
  - key: item
    description: "Test item"
`,
    );

    const domains = loadYamlKnowledge(testDir);
    expect(domains.length).toBeGreaterThanOrEqual(1);
  });

  it('should return empty array for nonexistent directory', () => {
    const domains = loadYamlKnowledge('/nonexistent/path');
    expect(domains).toEqual([]);
  });

  it('should load a single YAML file', () => {
    const filePath = join(testDir, 'test.yaml');
    writeFileSync(
      filePath,
      `domain: wealth
description: "Wealth management"
entries:
  - key: patrimony
    description: "Client patrimony"
    fields: [realEstate, securities]
    relatedExperts: [archimede]
`,
    );

    const domain = loadYamlFile(filePath);
    expect(domain).not.toBeNull();
    expect(domain!.domain).toBe('wealth');
    expect(domain!.entries[0]!.relatedExperts).toEqual(['archimede']);
  });
});
