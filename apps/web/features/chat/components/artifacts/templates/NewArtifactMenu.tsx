'use client';

import { useState } from 'react';
import { FilePlus2, FileText, FolderCog, PenTool, Presentation } from 'lucide-react';
import { LibraryManagerDialog } from '../library/LibraryDialogs';
import { useStudioLibrary, type StudioLibraryItem } from '../library/studio-library-client';
import { toast } from 'sonner';
import { DesignBriefDialog } from '../design/DesignBriefDialog';
import { buildDesignFromBriefRequest } from '../design/design-brief';
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

function savedTemplate(item: StudioLibraryItem): ArtifactTemplate | null {
  if (item.kind === 'brand') return null;
  return {
    id: `saved-${item.id}`,
    kind: item.kind === 'deck_template' ? 'presentation' : 'document',
    name: item.name,
    description: '',
    title: item.payload.title,
    content: item.payload.content,
  };
}

export function NewArtifactMenu({
  conversationId,
  onRequestEdits,
}: {
  conversationId: string | null;
  onRequestEdits?: (prompt: string) => boolean;
}) {
  const create = useCreateFromTemplate(conversationId);
  const [briefOpen, setBriefOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const library = useStudioLibrary();
  const savedTemplates = library.items
    .map(savedTemplate)
    .filter((template): template is ArtifactTemplate => template !== null);
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
    {
      id: 'manage-library',
      label: 'Templates and brands',
      group: 'Saved',
      icon: FolderCog,
      onSelect: () => setManagerOpen(true),
    },
    ...(onRequestEdits
      ? [
          {
            id: 'design-brief',
            label: 'Design from a brief',
            group: 'Designs',
            icon: PenTool,
            onSelect: () => setBriefOpen(true),
          },
        ]
      : []),
  ];
  return (
    <>
      <DeckMenu
        label={NEW_ARTIFACT_LABEL}
        icon={FilePlus2}
        items={items}
        testId="artifact-new-menu"
        align="end"
        compact
        onOpenChange={(open) => {
          if (open) void library.load();
        }}
      />
      <LibraryManagerDialog open={managerOpen} onOpenChange={setManagerOpen} />
      {onRequestEdits ? (
        <DesignBriefDialog
          open={briefOpen}
          onOpenChange={setBriefOpen}
          heading="Design from a brief"
          submitLabel="Create design"
          onSubmit={(brief) => {
            const sent = onRequestEdits(buildDesignFromBriefRequest(brief));
            if (!sent) toast.error('The design request was not sent. Try again.');
            return sent;
          }}
        />
      ) : null}
    </>
  );
}
