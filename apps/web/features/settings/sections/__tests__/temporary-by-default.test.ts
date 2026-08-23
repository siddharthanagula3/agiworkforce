import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const createSource = readFileSync(join(process.cwd(), 'lib/hooks/useConversations.ts'), 'utf8');
const privacySource = readFileSync(
  join(process.cwd(), 'features/settings/sections/PrivacySection.tsx'),
  'utf8',
);

// The 'rememberChats' switch was removed from this screen for lying: nothing
// read it. This preference must not repeat that — it has to be honoured by the
// save path, and honoured AT CREATION so the first message is never persisted.
describe('start new chats as temporary', () => {
  it('is sent when the conversation is created, not applied afterwards', () => {
    const create = createSource.slice(createSource.indexOf('/api/chat/conversations'));
    expect(create).toContain('newChatsTemporary');
    expect(create).toContain('isTemporary: true');
  });

  it('sends nothing extra when the preference is off', () => {
    // A spread guarded on the preference, not `isTemporary: <boolean>`, so an
    // off preference cannot overwrite a caller that asked for temporary.
    expect(createSource).toMatch(/\?\s*\{ isTemporary: true \}\s*:\s*\{\}/);
  });

  it('reads the preference at call time rather than capturing it in a closure', () => {
    // A stale closure would keep creating saved chats after the user turned the
    // preference on, which is the failure the user would never notice.
    expect(createSource).toContain('useSettingsStore.getState().newChatsTemporary');
  });

  it('is offered on the privacy screen with an accessible switch', () => {
    expect(privacySource).toContain('aria-label="Start new chats as temporary"');
    expect(privacySource).toContain('role="switch"');
  });

  it('does not resurrect the rememberChats switch that was removed for lying', () => {
    // Asserted on the toggle registry, not on prose: the name appears in two
    // comments that exist precisely to explain why the switch is absent, and a
    // naive string match would fail on the documentation rather than the code.
    const toggleKeys = /type ToggleKey = ([^;]+);/.exec(privacySource)?.[1] ?? '';
    expect(toggleKeys).not.toContain('rememberChats');
    expect(toggleKeys).not.toContain('locationMetadata');
    expect(toggleKeys).not.toContain('improveModelTraining');
  });

  it('keeps the note explaining why the dead toggles stay out', () => {
    expect(privacySource).toContain('a switch that saves but changes nothing is a dead control');
  });
});
