import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  dataTransferCarriesFiles,
  filesFromDataTransfer,
} from '@agiworkforce/utils/composer-paste';

const sidePanelSource = readFileSync(resolve(process.cwd(), 'src/side_panel.ts'), 'utf8');

describe('side panel composer paste/drop contract', () => {
  it('takes its paste and drag policy from the shared module', () => {
    expect(sidePanelSource).toContain("from '@agiworkforce/utils/composer-paste'");
  });

  it('keeps no hand-written clipboard or drag extraction of its own', () => {
    expect(sidePanelSource).not.toContain('getAsFile(');
    expect(sidePanelSource).not.toContain("=== 'Files'");
  });

  it('shares one extraction for pasted and dropped files', () => {
    const png = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' });
    const transfer = {
      items: { length: 1, 0: { kind: 'file', getAsFile: () => png } },
      types: ['Files'],
      getData: () => '',
    } as unknown as DataTransfer;

    expect(filesFromDataTransfer(transfer)).toEqual([png]);
    expect(dataTransferCarriesFiles(transfer)).toBe(true);
  });
});
