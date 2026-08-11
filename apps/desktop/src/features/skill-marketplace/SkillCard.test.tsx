import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  useSkillMarketplaceStore,
  type MarketplaceSkill,
} from '../../stores/skillMarketplaceStore';
import { SkillCard } from './SkillCard';

const runtimeLoadedSkill: MarketplaceSkill = {
  name: 'fixture-runtime-skill',
  description: 'A runtime-loaded fixture skill.',
  sourceType: 'workspace',
  requiresBins: [],
  requiresEnv: [],
  supportedOs: [],
  allowedTools: [],
  contextMode: 'main',
  category: 'productivity',
  // This legacy renderer-only bit must not create a fake execution control.
  isActive: false,
};

describe('SkillCard capability honesty', () => {
  beforeEach(() => {
    useSkillMarketplaceStore.setState({ expandedSkillName: null });
  });

  afterEach(() => cleanup());

  it.each(['grid', 'list'] as const)(
    'shows runtime availability without a cosmetic enable switch in %s view',
    (viewMode) => {
      render(<SkillCard skill={runtimeLoadedSkill} viewMode={viewMode} />);

      expect(screen.getByText('Available')).toBeInTheDocument();
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/toggle fixture runtime skill/i)).not.toBeInTheDocument();
    },
  );
});
