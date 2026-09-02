import type { ReactNode } from 'react';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { Prose, Stack } from '../../system';

export interface NoteItem {
  title: string;
  body: ReactNode;
}

export function NoteList({ items }: { items: readonly NoteItem[] }) {
  return (
    <Stack gap="loose">
      {items.map((item) => (
        <Stack gap="tight" key={item.title}>
          <h3 className="agi-ds-h3">{item.title}</h3>
          <Prose size="sm">{item.body}</Prose>
        </Stack>
      ))}
    </Stack>
  );
}

export function FounderBlock({
  quote,
  body,
  name,
  role,
}: {
  quote: ReactNode;
  body: ReactNode;
  name: string;
  role: string;
}) {
  return (
    <Stack gap="loose">
      <AgiMark size={40} accent="var(--agi-ink)" />
      <h2 className="agi-ds-h2">{quote}</h2>
      <Prose>{body}</Prose>
      <p className="agi-ds-prose" data-size="sm">
        <strong>{name}</strong> &middot; {role}
      </p>
    </Stack>
  );
}
