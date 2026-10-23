import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

import { NavGroup } from '../NavGroup';
import { NAV_GROUPS } from '../nav';

describe.each(NAV_GROUPS.map((group) => [group.label, group] as const))(
  'the %s menu from the keyboard',
  (label, group) => {
    it('opens on Enter, reaches every link by Tab and closes on Escape with focus back on the trigger', async () => {
      const user = userEvent.setup();
      render(<NavGroup group={group} />);
      const trigger = screen.getByRole('button', { name: label });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      trigger.focus();
      await user.keyboard('{Enter}');
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      const panel = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
      expect(panel).not.toBeNull();
      expect(panel).not.toHaveAttribute('hidden');

      const expected = [...group.items.map((item) => item.href), group.footer?.href].filter(
        Boolean,
      );
      const reached: (string | null)[] = [];
      for (let step = 0; step < expected.length; step += 1) {
        await user.tab();
        reached.push((document.activeElement as HTMLElement).getAttribute('href'));
      }
      expect(reached).toEqual(expected);

      await user.keyboard('{Escape}');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveFocus();
    });

    it('gives every link a name a screen reader can announce', async () => {
      const user = userEvent.setup();
      render(<NavGroup group={group} />);
      await user.click(screen.getByRole('button', { name: label }));
      const links = screen.getAllByRole('link');
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        ...group.items.map((item) => item.href),
        ...(group.footer ? [group.footer.href] : []),
      ]);
      for (const link of links) {
        expect(link).toHaveAccessibleName();
      }
    });
  },
);
