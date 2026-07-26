import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { useChatStore } from '../../stores/chatStore';
import { QuickChips } from '../QuickChips';

describe('QuickChips runtime capabilities', () => {
  beforeEach(() => {
    useChatStore.setState({ activeMode: null });
  });

  it('preserves every existing quick action when a host does not declare capabilities', () => {
    const html = renderToStaticMarkup(<QuickChips onChipClick={vi.fn()} />);

    expect(html).toContain('>Image<');
    expect(html).toContain('>Video<');
    expect(html).toContain('>Computer<');
  });

  it('hides only capabilities that the active runtime explicitly rejects', () => {
    const html = renderToStaticMarkup(
      <QuickChips
        onChipClick={vi.fn()}
        availability={{
          image: true,
          video: false,
          computer: false,
        }}
      />,
    );

    expect(html).toContain('>Code<');
    expect(html).toContain('>Write<');
    expect(html).toContain('>Research<');
    expect(html).toContain('>Image<');
    expect(html).not.toContain('>Video<');
    expect(html).not.toContain('>Computer<');
  });
});
