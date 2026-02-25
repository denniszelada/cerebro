import { describe, it, expect } from 'vitest';
import { Pipeline } from '../pipeline/builder.js';

describe('Pipeline Builder', () => {
  it('should create a single expert step', () => {
    const def = Pipeline.from('Extractor').build('test');
    expect(def.root.type).toBe('expert');
    expect(def.name).toBe('test');
    if (def.root.type === 'expert') {
      expect(def.root.expertName).toBe('Extractor');
    }
  });

  it('should create a chain of experts', () => {
    const def = Pipeline.from('Extractor').then('Classifier').then('Formatter').build();
    expect(def.root.type).toBe('chain');
    if (def.root.type === 'chain') {
      expect(def.root.steps).toHaveLength(3);
      expect(def.root.steps[0]!.type).toBe('expert');
      expect(def.root.steps[1]!.type).toBe('expert');
      expect(def.root.steps[2]!.type).toBe('expert');
    }
  });

  it('should create parallel steps', () => {
    const def = Pipeline.parallel(
      Pipeline.from('CustomerData'),
      Pipeline.from('Inventory'),
    ).build();

    expect(def.root.type).toBe('parallel');
    if (def.root.type === 'parallel') {
      expect(def.root.steps).toHaveLength(2);
    }
  });

  it('should create parallel with merge', () => {
    const def = Pipeline.parallel(
      Pipeline.from('A'),
      Pipeline.from('B'),
    ).merge('my-merge').build();

    expect(def.root.type).toBe('parallel');
    if (def.root.type === 'parallel') {
      expect(def.root.merge).toBe('my-merge');
    }
  });

  it('should create conditional steps', () => {
    const def = Pipeline.from('Classifier')
      .when('type == invoice', Pipeline.from('InvoiceProcessor'), Pipeline.from('GenericProcessor'))
      .build();

    expect(def.root.type).toBe('chain');
    if (def.root.type === 'chain') {
      expect(def.root.steps).toHaveLength(2);
      expect(def.root.steps[1]!.type).toBe('conditional');
    }
  });

  it('should compose nested pipelines', () => {
    const def = Pipeline.from('Classifier')
      .then(
        Pipeline.parallel(
          Pipeline.from('Enricher'),
          Pipeline.from('RiskAnalyzer'),
        ).merge(),
      )
      .then('Formatter')
      .build();

    expect(def.root.type).toBe('chain');
    if (def.root.type === 'chain') {
      expect(def.root.steps).toHaveLength(3);
      expect(def.root.steps[0]!.type).toBe('expert');
      expect(def.root.steps[1]!.type).toBe('parallel');
      expect(def.root.steps[2]!.type).toBe('expert');
    }
  });

  it('should support expert step options', () => {
    const def = Pipeline.from('SlowExpert', {
      timeout: 60_000,
      retries: 3,
      instruction: 'Do something complex',
    }).build();

    if (def.root.type === 'expert') {
      expect(def.root.timeout).toBe(60_000);
      expect(def.root.retries).toBe(3);
      expect(def.root.instruction).toBe('Do something complex');
    }
  });

  it('should create map steps', () => {
    const def = Pipeline.from('ListGenerator')
      .map('items', Pipeline.from('ItemProcessor'), 5)
      .build();

    expect(def.root.type).toBe('chain');
    if (def.root.type === 'chain') {
      expect(def.root.steps).toHaveLength(2);
      const mapStep = def.root.steps[1]!;
      expect(mapStep.type).toBe('map');
      if (mapStep.type === 'map') {
        expect(mapStep.sourceKey).toBe('items');
        expect(mapStep.maxConcurrency).toBe(5);
      }
    }
  });
});
