import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import i18next from 'i18next';
import esChat from '../../../../i18n/locales/es/chat.json' with { type: 'json' };
import { MessageBubble } from '../MessageBubble';
import type { ChatMessage } from '../../lib/types';

// WEB-CORE-CHAT-UI-NOT-LOCALISED-01 slice 2: bubble.* keys carried an inline
// English default with no catalogue entry in any locale, so a Spanish user
// saw English chrome. This renders against the real es/chat.json bundle (not
// a synthetic fixture) to prove the catalogue entry is what resolves, not
// the inline default.
afterEach(() => {
  cleanup();
});

const userMessage: ChatMessage = {
  id: 'u1',
  role: 'user',
  content: 'original question',
  createdAt: '2026-08-16T12:00:00.000Z',
};

describe('MessageBubble resolves bubble.* keys from the real catalogue', () => {
  beforeAll(async () => {
    await i18next.init({
      lng: 'es',
      fallbackLng: false,
      supportedLngs: ['es'],
      nonExplicitSupportedLngs: false,
      ns: ['chat'],
      defaultNS: 'chat',
      interpolation: { escapeValue: false },
      resources: { es: { chat: esChat } },
    });
  });

  it('renders the Spanish bubble.editMessage translation, not the English default', async () => {
    await i18next.changeLanguage('es');
    render(<MessageBubble message={userMessage} onEdit={() => {}} />);

    expect(screen.getByRole('button', { name: 'Editar mensaje' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit message' })).toBeNull();
  });
});
