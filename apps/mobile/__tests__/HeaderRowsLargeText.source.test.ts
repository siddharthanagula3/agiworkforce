import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const TITLE_CAP = 'maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}';
const FIXED_ROW_HEIGHT =
  /(?<![\w-])h-(?:11|12|13|14)\b|(?<![A-Za-z])(?<!width: 48,\s+)height: (?:48|58),/;

const HEADER_SCREENS: Array<{ file: string; titles: number }> = [
  { file: 'app/(app)/(tabs)/projects.tsx', titles: 1 },
  { file: 'app/(app)/about.tsx', titles: 1 },
  { file: 'app/(app)/companion/agent/[id].tsx', titles: 2 },
  { file: 'app/(app)/companion/code/[threadId].tsx', titles: 1 },
  { file: 'app/(app)/models.tsx', titles: 1 },
  { file: 'app/(app)/notifications/index.tsx', titles: 1 },
  { file: 'app/(app)/projects/[id].tsx', titles: 1 },
  { file: 'app/(app)/schedules/create.tsx', titles: 1 },
  { file: 'app/(app)/schedules/index.tsx', titles: 1 },
  { file: 'app/(app)/schedules/runs.tsx', titles: 1 },
  { file: 'app/(app)/settings/memory-import.tsx', titles: 1 },
  { file: 'app/(app)/translate.tsx', titles: 1 },
  { file: 'src/features/compare/index.tsx', titles: 1 },
  { file: 'src/features/library/index.tsx', titles: 1 },
  { file: 'src/features/projects/components/ProjectEditorModal.tsx', titles: 1 },
  { file: 'src/shared/components/cloud-screen/index.tsx', titles: 1 },
  { file: 'src/features/settings/permissions/Detail.tsx', titles: 2 },
];

const SHARED_HEADER_SCREENS = [
  'app/(app)/settings/integrations.tsx',
  'app/(app)/settings/performance.tsx',
  'app/(app)/settings/workspace.tsx',
  'src/features/widget-setup/index.tsx',
];

describe('screen header rows at large text sizes', () => {
  it.each(HEADER_SCREENS)('$file lets its header row grow with its title', ({ file }) => {
    const source = readFileSync(join(ROOT, file), 'utf8');

    expect(source.match(FIXED_ROW_HEIGHT)).toBeNull();
  });

  it.each(HEADER_SCREENS)(
    '$file caps its header title like the other headers',
    ({ file, titles }) => {
      const source = readFileSync(join(ROOT, file), 'utf8');

      expect(source.split(TITLE_CAP).length - 1).toBeGreaterThanOrEqual(titles);
    },
  );

  it.each(SHARED_HEADER_SCREENS)('%s draws the shared centred header', (file) => {
    const source = readFileSync(join(ROOT, file), 'utf8');

    expect(source).toContain("from '@/src/shared/components/cloud-screen'");
    expect(source).toContain('<ScreenHeader');
    expect(source.match(FIXED_ROW_HEIGHT)).toBeNull();
  });
});
