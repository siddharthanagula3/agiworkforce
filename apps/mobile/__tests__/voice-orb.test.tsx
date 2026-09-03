import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react-native';
import { VoiceOrb, smoothVoiceLevel } from '@/src/features/voice/components/VoiceOrb';

const ORB_SOURCE = readFileSync(
  join(__dirname, '..', 'src/features/voice/components/VoiceOrb.tsx'),
  'utf8',
);

function effectDependencies(source: string): string[][] {
  const out: string[][] = [];
  const effects = /useEffect\(/g;
  let match: RegExpExecArray | null;
  while ((match = effects.exec(source)) !== null) {
    const deps = /\}, \[([\s\S]*?)\]\);/.exec(source.slice(match.index));
    if (!deps) continue;
    out.push(
      deps[1]
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean),
    );
  }
  return out;
}

describe('VoiceOrb', () => {
  it('renders at both call-site sizes', () => {
    const inline = render(<VoiceOrb phase="idle" />);
    expect(inline.getByTestId('voice-orb')).toBeTruthy();

    const companion = render(<VoiceOrb phase="listening" audioLevel={0.4} size={120} glow />);
    expect(companion.getByTestId('voice-orb')).toBeTruthy();
  });

  describe('effect shape', () => {
    const deps = effectDependencies(ORB_SOURCE);

    it('has one phase-driven effect and one amplitude-driven effect', () => {
      expect(deps).toHaveLength(2);
    });

    it('keeps audioLevel out of the phase effect', () => {
      const phaseEffect = deps.find((d) => d.includes('phase'));
      expect(phaseEffect).toBeDefined();
      expect(phaseEffect).not.toContain('audioLevel');
    });

    it('drives amplitude from its own effect', () => {
      const amplitudeEffect = deps.find((d) => d.includes('audioLevel'));
      expect(amplitudeEffect).toBeDefined();
      expect(amplitudeEffect).not.toContain('phase');
    });

    it('never springs the orb', () => {
      expect(ORB_SOURCE).not.toMatch(/withSpring\s*\(/);
      expect(ORB_SOURCE).toMatch(/withTiming\(1 \+ level \* /);
    });
  });

  describe('level smoothing', () => {
    it('moves a quarter of the way toward a new level', () => {
      expect(smoothVoiceLevel(0, 1)).toBeCloseTo(0.25, 10);
      expect(smoothVoiceLevel(1, 0)).toBeCloseTo(0.75, 10);
    });

    it('cannot let a single-frame spike snap the orb', () => {
      const spike = smoothVoiceLevel(0, 1);
      expect(spike).toBeLessThan(0.3);
      expect(smoothVoiceLevel(spike, 0)).toBeLessThan(spike);
    });

    it('converges monotonically on a sustained level', () => {
      let level = 0;
      const seen: number[] = [];
      for (let i = 0; i < 12; i++) {
        level = smoothVoiceLevel(level, 0.8);
        seen.push(level);
      }
      for (let i = 1; i < seen.length; i++) {
        expect(seen[i]).toBeGreaterThan(seen[i - 1]);
        expect(seen[i]).toBeLessThanOrEqual(0.8);
      }
      expect(seen[seen.length - 1]).toBeCloseTo(0.8, 1);
    });
  });
});
