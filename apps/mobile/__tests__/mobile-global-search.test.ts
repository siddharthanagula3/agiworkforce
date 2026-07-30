import {
  buildMobileGlobalSearchGroups,
  collectSearchableMobileFiles,
} from '../src/features/search/mobileGlobalSearch';
import type { MobileArtifact } from '../src/features/artifacts/types';
import type { LibraryImage } from '../src/features/library/collectGeneratedImages';
import type { ConversationSummary } from '../types/chat';

const conversations: ConversationSummary[] = [
  {
    id: 'chat-title',
    title: 'Launch checklist',
    lastMessage: 'Ready for review',
    createdAt: '2026-07-30T10:00:00.000Z',
    updatedAt: '2026-07-30T10:00:00.000Z',
    messageCount: 2,
    pinned: false,
    executionMode: 'local',
  },
  {
    id: 'chat-content',
    title: 'Untitled planning',
    createdAt: '2026-07-30T09:00:00.000Z',
    updatedAt: '2026-07-30T09:00:00.000Z',
    messageCount: 3,
    pinned: false,
    executionMode: 'local',
  },
];

const artifacts: MobileArtifact[] = [
  {
    id: 'artifact-1',
    title: 'Deployment notes',
    kind: 'document',
    content: 'Launch runbook and rollback checklist',
    ageLabel: 'just now',
    sourceLabel: 'Release chat',
    accentColor: '#fff',
    previewLines: ['Launch runbook'],
    provenance: { scope: 'local' },
  },
];

const libraryImages: LibraryImage[] = [
  {
    id: 'image-1',
    conversationId: 'chat-title',
    imageUrl: '/api/files/11111111-1111-4111-8111-111111111111',
    prompt: 'Launch poster',
    createdAt: '2026-07-30T10:00:00.000Z',
    sourceLabel: 'Design work',
  },
];

describe('Mobile global search projection', () => {
  it('groups title, message-content, project, Library, and artifact matches', () => {
    const result = buildMobileGlobalSearchGroups({
      query: 'launch',
      conversations,
      conversationContentMatchIds: new Set(['chat-content']),
      projects: [{ id: 'project-1', name: 'Launch project', description: 'Release work' }],
      files: [
        {
          id: 'message-1:0',
          conversationId: 'chat-title',
          fileName: 'launch-plan.pdf',
          mimeType: 'application/pdf',
          conversationTitle: 'Launch checklist',
        },
      ],
      libraryImages,
      artifacts,
    });

    expect(result.chats).toEqual([
      expect.objectContaining({ id: 'chat-title', title: 'Launch checklist' }),
      expect.objectContaining({ id: 'chat-content', subtitle: 'Matched message content' }),
    ]);
    expect(result.projects).toEqual([
      expect.objectContaining({ id: 'project-1', title: 'Launch project' }),
    ]);
    expect(result.files).toEqual([
      expect.objectContaining({
        id: 'message-1:0',
        targetId: 'chat-title',
        title: 'launch-plan.pdf',
      }),
    ]);
    expect(result.library).toEqual([
      expect.objectContaining({ id: 'image-1', title: 'Launch poster' }),
    ]);
    expect(result.artifacts).toEqual([
      expect.objectContaining({ id: 'artifact-1', title: 'Deployment notes' }),
    ]);
  });

  it('returns no data for a blank query', () => {
    expect(
      buildMobileGlobalSearchGroups({
        query: '   ',
        conversations,
        conversationContentMatchIds: new Set(),
        projects: [],
        files: [],
        libraryImages,
        artifacts,
      }),
    ).toEqual({ chats: [], projects: [], files: [], library: [], artifacts: [] });
  });

  it('projects authorized transcript attachments without copying file bytes', () => {
    expect(
      collectSearchableMobileFiles([conversations[0]!], {
        'chat-title': [
          {
            id: 'message-1',
            conversationId: 'chat-title',
            role: 'user',
            content: 'Review this file',
            createdAt: '2026-07-30T10:00:00.000Z',
            attachments: [
              {
                url: 'file:///documents/launch-plan.pdf',
                mimeType: 'application/pdf',
                fileName: 'launch-plan.pdf',
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        id: 'message-1:0',
        conversationId: 'chat-title',
        fileName: 'launch-plan.pdf',
        mimeType: 'application/pdf',
        conversationTitle: 'Launch checklist',
      },
    ]);
  });
});
