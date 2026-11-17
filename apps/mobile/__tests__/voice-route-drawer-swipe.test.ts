import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const layout = readFileSync(resolve(__dirname, '..', 'app/(app)/_layout.tsx'), 'utf8');

describe('the voice route in the app drawer', () => {
  it('does not let an edge swipe pull the themed drawer over the dark voice screen', () => {
    expect(layout).toContain('const VOICE_SCREEN = { ...HIDDEN, swipeEnabled: false };');
    expect(layout).toContain('<Drawer.Screen name="voice" options={VOICE_SCREEN} />');
  });

  it('keeps the edge swipe on the chat routes', () => {
    expect(layout).toContain('<Drawer.Screen name="(tabs)" options={HIDDEN} />');
    expect(layout).toContain("const HIDDEN = { drawerItemStyle: { display: 'none' as const } };");
  });
});
