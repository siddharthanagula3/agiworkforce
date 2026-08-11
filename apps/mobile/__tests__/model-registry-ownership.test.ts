import fs from 'node:fs';
import path from 'node:path';
import { getDefaultModel, getModelsForRole } from '@agiworkforce/local-llm';

describe('mobile model registry ownership', () => {
  it('does not maintain an app-owned fallback local model record', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/features/model-picker/service.ts'),
      'utf8',
    );

    expect(source).not.toContain('FALLBACK_LOCAL_MODEL');
    expect(source).not.toContain(`id: '${getDefaultModel().id}'`);
  });

  it('does not hardcode a local benchmark model outside the local model catalog', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../app/(app)/settings/performance.tsx'),
      'utf8',
    );

    expect(source).not.toContain(`'${getDefaultModel().id}'`);
  });

  it('derives tier-one system model ids from the shared local model catalog', () => {
    for (const relativePath of [
      '../src/features/model-picker/localModelRuntime.ts',
      '../src/features/model-picker/installStore.ts',
    ]) {
      const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
      for (const model of getModelsForRole('system-multimodal')) {
        expect(source).not.toContain(`'${model.id}'`);
      }
    }
  });
});
