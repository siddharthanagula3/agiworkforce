import * as owned from '@agiworkforce/icons';
import { render } from '@testing-library/react';
import { Wrench } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { lucideToolIcon, TOOL_ICON_NAMES } from '../toolIcon';

const MIGRATED = [
  'Clock',
  'Code',
  'Database',
  'FileText',
  'FolderOpen',
  'Globe',
  'HelpCircle',
  'Image',
  'MessageSquare',
  'Search',
  'Settings',
  'Terminal',
  'Video',
] as const;

function renderIconByName(iconName: string): SVGSVGElement {
  const Component = lucideToolIcon(iconName);
  const { container } = render(<Component />);
  const svg = container.querySelector('svg');
  if (!svg) throw new Error(`"${iconName}" rendered no <svg> root`);
  return svg;
}

describe('lucideToolIcon', () => {
  it.each(TOOL_ICON_NAMES)('resolves "%s" to a renderable 24px component', (iconName) => {
    expect(renderIconByName(iconName).getAttribute('viewBox')).toBe('0 0 24 24');
  });

  it('falls back to Wrench for an unknown name', () => {
    expect(lucideToolIcon('NotARealToolIcon')).toBe(Wrench);
    expect(renderIconByName('NotARealToolIcon')).toBeTruthy();
  });

  it.each(MIGRATED)('serves "%s" from the owned icon family', (iconName) => {
    expect(lucideToolIcon(iconName)).toBe(owned[iconName]);
  });

  it('keeps the un-migrated glyphs on lucide', () => {
    const remaining = TOOL_ICON_NAMES.filter(
      (iconName) => !MIGRATED.includes(iconName as (typeof MIGRATED)[number]),
    );

    expect(remaining.length).toBeGreaterThan(0);
    for (const iconName of remaining) {
      expect(Object.keys(owned)).not.toContain(iconName);
    }
  });
});
