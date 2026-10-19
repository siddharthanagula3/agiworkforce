'use client';

import { FilePlus2, FileText, Presentation } from 'lucide-react';
import { DeckMenu, type DeckMenuItem } from '../presentation/DeckMenu';
import { useArtifactsStore } from '../../../stores/artifacts-store';
import { fillTemplate, templatesOfKind, type ArtifactTemplate } from './artifact-templates';

export const NEW_ARTIFACT_LABEL = 'New from template';

export function useCreateFromTemplate(conversationId: string | null) {
  const addArtifact = useArtifactsStore((s) => s.addArtifact);
  const selectArtifact = useArtifactsStore((s) => s.selectArtifact);
  return (template: ArtifactTemplate): string | null => {
    if (!conversationId) return null;
    const id = addArtifact({
      id: crypto.randomUUID(),
      type: template.kind,
      title: template.title,
      language: 'markdown',
      content: `${fillTemplate(template.content).trim()}\n`,
      messageId: '',
      conversationId,
    });
    selectArtifact(id);
    return id;
  };
}

export function NewArtifactMenu({
  conversationId,
  savedTemplates = [],
}: {
  conversationId: string | null;
  savedTemplates?: readonly ArtifactTemplate[];
}) {
  const create = useCreateFromTemplate(conversationId);
  if (!conversationId) return null;
  const toItem =
    (group: string) =>
    (template: ArtifactTemplate): DeckMenuItem => ({
      id: `template-${template.id}`,
      label: template.name,
      group,
      icon: template.kind === 'presentation' ? Presentation : FileText,
      onSelect: () => {
        create(template);
      },
    });
  const items: DeckMenuItem[] = [
    ...templatesOfKind('document').map(toItem('Documents')),
    ...templatesOfKind('presentation').map(toItem('Presentations')),
    ...savedTemplates.map(toItem('Your templates')),
  ];
  return (
    <DeckMenu
      label={NEW_ARTIFACT_LABEL}
      icon={FilePlus2}
      items={items}
      testId="artifact-new-menu"
      align="end"
      compact
    />
  );
}
