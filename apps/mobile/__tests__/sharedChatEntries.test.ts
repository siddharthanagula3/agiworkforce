import {
  isAllowedPlaceDirectionsUrl,
  placePhotoUrl,
  SHARED_ATTACHMENTS_NOT_COPIED,
} from '@agiworkforce/cloud-contracts';
import {
  cardLeadsProse,
  hasKnownMediaFrame,
  orderProjectFileCitationsByAnswer,
  projectFileCitationTarget,
} from '@agiworkforce/types';
import { documentTitleFromAnswer } from '@agiworkforce/unified-chat/answer-document';
import { classifyAssistantFence } from '@agiworkforce/unified-chat/assistant-fence';
import {
  citationPublishedLabel,
  citationSnippet,
} from '@agiworkforce/unified-chat/citation-publisher';
import { codeFileFor } from '@agiworkforce/unified-chat/code-file-name';
import { resolveHighlightLanguage } from '@agiworkforce/unified-chat/highlight-languages';
import { decodeHtmlEntities } from '@agiworkforce/unified-chat/html-entities';
import {
  collectMessageResearchSources,
  displaySourceSnippet,
  orderSourcesByCitation,
} from '@agiworkforce/unified-chat/message-sources';
import { assistantNoteForPlace, placeSummaryLine } from '@agiworkforce/unified-chat/place-facts';
import { richBlocksAsPlainText } from '@agiworkforce/unified-chat/rich-blocks';
import { createMarkdownBlockSplitter } from '@agiworkforce/unified-chat/split-markdown-blocks';
import { documentDirection, textDirection } from '@agiworkforce/unified-chat/text-direction';
import { markdownToDocumentBlocks } from '@agiworkforce/unified-chat/markdown-document';

import {
  CHAT_CODE_RUN_CONFIRMATION,
  responseRatingFeedbackBody,
  toolApprovalScopeConfirmation,
} from '@agiworkforce/cloud-contracts';
import { buildChangeReview, resolveReview, withoutArtifactMarker } from '@agiworkforce/artifacts';
import { categoryToKind } from '@agiworkforce/unified-chat/activity-kinds';
import { ANSWER_UI_MAP_NOTE } from '@agiworkforce/unified-chat/answer-ui';
import { normalizeEditInstruction } from '@agiworkforce/unified-chat/artifact-edit-request';
import { isExecutingCode } from '@agiworkforce/unified-chat/code-execution-result';
import { parseQualifiedConnectorTool } from '@agiworkforce/unified-chat/connector-step-sentence';
import { parseInsights } from '@agiworkforce/unified-chat/deck-insights';
import { buildSlideEditRequest } from '@agiworkforce/unified-chat/deck-request';
import { sanitizeFilename } from '@agiworkforce/unified-chat/filename';
import { followUpAsksForWebSearch } from '@agiworkforce/unified-chat/follow-ups';
import { mcpAppPlainResultText } from '@agiworkforce/unified-chat/mcp-app';
import { stripTrailingSourceList } from '@agiworkforce/unified-chat/report-sources';
import { parseQuiz, shortAnswerRecheckPrompt } from '@agiworkforce/unified-chat/study-set';
import { classifyToolFailure, toolFailureReason } from '@agiworkforce/unified-chat/tool-failure';
import {
  DECLINED_WEB_SEARCH_ANSWER,
  catalogConnectorName,
  connectorAccessSentence,
  connectorOutcomeNotice,
  connectorRiskClass,
  conversationToolGrantPath,
  conversationToolGrantRevokeConfirmation,
  describeMcpTool,
  describeSecretRedactionNotice,
  isDeclinedWebSearchError,
  isFreeRouteLane,
  isKnowledgeIndexInProgress,
} from '@agiworkforce/cloud-contracts';
import { describeCloudCodeRuntime, parsePastChatCitations } from '@agiworkforce/types';
import { artifactKindLabel } from '@agiworkforce/artifacts';
import { classifyStreamingFence } from '@agiworkforce/unified-chat/assistant-fence';
import { dropOpenLinkDestination } from '@agiworkforce/unified-chat/complete-inline-tokens';
import { readableImageAlt } from '@agiworkforce/unified-chat/markdown-image-sources';
import { splitSlides } from '@agiworkforce/unified-chat/presentation-slides';
import { buildReactPreviewDocument } from '@agiworkforce/unified-chat/react-preview-document';
import { nextTabularSort, sortTabularRows } from '@agiworkforce/unified-chat/tabular';
import {
  turnDeclinedSearch,
  webSearchNoticeFor,
} from '@agiworkforce/unified-chat/web-search-notice';
import { answerFormatCardType } from '@agiworkforce/unified-chat/message-format';
import { resolveModelEscalation } from '@agiworkforce/unified-chat/model-escalation';
import { getManagedModelPresentationLabel } from '@agiworkforce/unified-chat/model-info';
import {
  buildArtifactSelectionRequest,
  captureSelectionContext,
} from '@agiworkforce/unified-chat/artifact-selection-request';
import {
  NEW_SLIDE_MARKDOWN,
  parseDeck,
  serializeDeck,
} from '@agiworkforce/unified-chat/deck-model';
import {
  parseResearchPlanQuestions,
  parseResearchRunConfig,
  researchAnswersGuidance,
} from '@agiworkforce/unified-chat/research-plan';
import {
  researchReportFilename,
  researchReportFollowUpPrompt,
  researchReportToMarkdown,
} from '@agiworkforce/unified-chat/research-report';
const OPAQUE_PROVIDER_TOKEN =
  'EqoDCioIBhgCIiQ0NGFlNjc2Yy05NThmLTRkNjQtYTQ3ZS0wNzMxNjZhNzE3ODQSDBlC8ePkQx7r9XmXrRoMbXNhdGVzLWNoYXQtMSIwTWQ2ZXF0V3pJcVhqR1RkUmF4eXpWbnZ4c0Y1K1FyNE1PeFRtWlZGU0dKZz0=';

describe('shared chat entries in the mobile runtime', () => {
  it('reads place cards, photos and directions the way web does', () => {
    expect(
      placeSummaryLine({
        placeId: 'p',
        name: 'Blue Bottle',
        latitude: 0,
        longitude: 0,
        priceLevel: 'moderate',
        category: 'Cafe',
      }),
    ).toBe('$$ · Cafe');
    expect(assistantNoteForPlace('Blue Bottle pours well. Others too.', 'Blue Bottle')).toBe(
      'Blue Bottle pours well.',
    );
    expect(placePhotoUrl('places/a/photos/b', 160)).toBe(
      '/api/maps/place-photo?ref=places%2Fa%2Fphotos%2Fb&w=160',
    );
    expect(isAllowedPlaceDirectionsUrl('https://maps.google.com/?cid=1')).toBe(true);
    expect(isAllowedPlaceDirectionsUrl('https://evil.example/?cid=1')).toBe(false);
    expect(cardLeadsProse({ cardId: 'c', kind: 'image.v1' }, { c: 40 })).toBe(false);
  });

  it('collects and orders a turn sources without showing a provider token as a snippet', () => {
    const { searchSources, citationsByMarker } = collectMessageResearchSources({
      searchResults: [
        { url: 'https://a.example/one', title: 'One', snippet: OPAQUE_PROVIDER_TOKEN },
        { url: 'https://b.example/two', title: 'Two', snippet: 'Readable text.' },
      ],
    });
    expect(searchSources.map((source) => source.snippet)).toEqual([undefined, 'Readable text.']);
    expect(displaySourceSnippet(OPAQUE_PROVIDER_TOKEN)).toBe('');
    const { cited, more } = orderSourcesByCitation('See [2].', citationsByMarker, searchSources);
    expect(cited.map((source) => source.url)).toEqual(['https://b.example/two']);
    expect(more.map((source) => source.url)).toEqual(['https://a.example/one']);
  });

  it('labels citations and project files from the shared rules', () => {
    expect(citationSnippet({ snippet: ' a \n b ' })).toBe('a b');
    expect(citationPublishedLabel({ publishedDate: '2 days ago' })).toBe('2 days ago');
    const pageTwo = { fileName: 'A.pdf', fileId: 'f', projectId: 'p', anchor: { page: 2 } };
    expect(projectFileCitationTarget(pageTwo)).toEqual({ projectId: 'p', fileId: 'f', page: 2 });
    expect(orderProjectFileCitationsByAnswer([{ fileName: 'B.md' }, pageTwo], 'p. 2')).toEqual([
      pageTwo,
      { fileName: 'B.md' },
    ]);
  });

  it('classifies streaming email and gallery fences and copies charts as text', () => {
    const email = classifyAssistantFence('email', 'To: a@example.com\nSub', { streaming: true });
    expect(email.kind === 'email' && email.headerFields).toEqual(['to']);
    const gallery = classifyAssistantFence('gallery', 'Hall | https://example.com/h.png | Before');
    expect(gallery.kind === 'gallery' && gallery.items[0]?.detail).toBe('Before');
    expect(
      richBlocksAsPlainText('```chart\n{"type":"bar","data":[{"name":"Jan","value":3}]}\n```'),
    ).toBe('Label\tValue\nJan\t3');
  });

  it('reads media frames, document titles, code file names and text direction', () => {
    expect(hasKnownMediaFrame('16:9')).toBe(true);
    expect(hasKnownMediaFrame('auto')).toBe(false);
    expect(documentTitleFromAnswer('## Packing list\n\n- Passport')).toBe('Packing list');
    expect(resolveHighlightLanguage('ts')).toBe('typescript');
    expect(codeFileFor('python').fileName).toMatch(/\.py$/);
    expect(textDirection('مرحبا')).toBe('rtl');
    expect(textDirection('Hello')).toBe('ltr');
    expect(documentDirection(markdownToDocumentBlocks('שלום עולם'))).toBe('rtl');
  });

  it('decodes every HTML named reference web decodes', () => {
    expect(decodeHtmlEntities('&alpha; &check; &notaname;')).toBe('\u03b1 \u2713 &notaname;');
  });

  it('shares the notice for attachments a continued shared chat did not copy', () => {
    expect(
      SHARED_ATTACHMENTS_NOT_COPIED.endsWith('kept private to the person who shared it:'),
    ).toBe(true);
  });

  it('splits settled markdown blocks from the streaming tail', () => {
    const split = createMarkdownBlockSplitter().update('One.\n\nTwo.\n\nThree.\n\nFour.\n\nFive');
    expect(split.settled.length).toBeGreaterThan(0);
    expect(split.tail.endsWith('Five')).toBe(true);
  });
  it('loads the entries moved out of web in this pass', () => {
    const quiz = parseQuiz(
      JSON.stringify({
        title: 'Cells',
        questions: [{ type: 'short_answer', question: 'Genetic material?', answer: 'DNA' }],
      }),
    );
    const question = quiz?.questions[0];
    expect(question?.kind).toBe('short_answer');
    if (question?.kind === 'short_answer') {
      expect(shortAnswerRecheckPrompt(question, 'RNA')).toContain('The expected answer is "DNA".');
    }
    expect(
      stripTrailingSourceList('Text [1].\n\n**Sources**\n[1] a.example, https://a.example/one'),
    ).toBe('Text [1].');
    expect(followUpAsksForWebSearch('Search the web for this')).toBe(true);
    expect(isExecutingCode({ toolCalls: [], isStreaming: false })).toBe(false);
    expect(toolFailureReason(classifyToolFailure('Upstream answered HTTP 404'))).toBe(
      'The item was not found.',
    );
    expect(categoryToKind('filesystem')).toBe('fs-list');
    expect(parseQualifiedConnectorTool('mcp__github__search_issues')).not.toBeNull();
    expect(sanitizeFilename('../a/b:c.txt')).toBe('b_c.txt');
    expect(ANSWER_UI_MAP_NOTE.length).toBeGreaterThan(0);
    expect(mcpAppPlainResultText({ content: [{ type: 'text', text: 'Done' }] })).toBe('Done');
    expect(normalizeEditInstruction('  Make it blue  ')).toBe('Make it blue');
    expect(parseInsights('- one\n* two')).toEqual(['one', 'two']);
    const review = buildChangeReview('a brown fox', 'a red fox');
    expect(review && resolveReview(review, null)).toBe('a brown fox');
    expect(withoutArtifactMarker('Plain text')).toBe('Plain text');
    expect(CHAT_CODE_RUN_CONFIRMATION.confirmLabel).toBe('Run again');
    expect(
      responseRatingFeedbackBody({
        rating: 'up',
        messageId: 'm1',
        surface: 'mobile',
        platform: 'ios',
        version: '1',
        userAgent: 'jest',
      }).metadata.source,
    ).toBe('mobile');
    expect(typeof toolApprovalScopeConfirmation).toBe('function');
  });

  it('loads the wave 2 pass 3 entries', () => {
    expect(isFreeRouteLane('free')).toBe(true);
    expect(isKnowledgeIndexInProgress({ status: 'stale' })).toBe(true);
    expect(describeSecretRedactionNotice(2)).toBe(
      '2 secrets were removed from this message before it was sent.',
    );
    expect(parsePastChatCitations([{ conversationId: 'c1' }])).toEqual([]);
    expect(classifyStreamingFence('form', 'title: A\ntext: Name\nse', false)?.kind).toBe('form');
    expect(dropOpenLinkDestination('See [a](https://x')).toBe('See a');
    expect(readableImageAlt('sunset-over-bay.png')).toBe('Sunset over bay');
    expect(splitSlides('# One\n\nA\n\n---\n\n# Two\n\nB')).toHaveLength(2);
    expect(
      buildReactPreviewDocument('export default function App() { return null; }', ''),
    ).toContain('<div id="root"></div>');
    const sort = nextTabularSort(null, 0);
    expect(sort).toEqual({ column: 0, direction: 'asc' });
    expect(
      sortTabularRows(
        {
          columns: ['n'],
          rows: [['2'], ['10'], ['1']],
          numericColumns: [true],
          source: 'delimited',
        },
        sort,
      ).map((row) => row[0]),
    ).toEqual(['1', '2', '10']);
    expect(
      webSearchNoticeFor({
        isUser: false,
        streaming: false,
        awaitingApproval: false,
        webSearchRequested: false,
        webSearchAskedInText: false,
        producedNoVisibleOutput: false,
        rendersResearchPlan: false,
        hasStreamError: false,
        webSearchUnavailable: false,
        toolAwaitingApproval: false,
        attemptedSearch: false,
        ranAnyTool: false,
        memoryCitationCount: 0,
        sourceCount: 0,
      }),
    ).toBeNull();
    expect(answerFormatCardType('Plain words.', [])).toBeNull();
    expect(
      resolveModelEscalation({
        movedFromModelId: undefined,
        movedReason: undefined,
        servedModelId: undefined,
        conversationModelId: undefined,
        routingSource: undefined,
      }),
    ).toBeNull();
    expect(typeof getManagedModelPresentationLabel).toBe('function');
  });

  it('loads the wave 3 entries', () => {
    expect(
      describeCloudCodeRuntime({
        name: 'Droid',
        summary: 'A software engineering agent.',
        cpuCount: 2,
        memoryMB: 4096,
        needsUserCredential: false,
      }),
    ).toBe('Droid, A software engineering agent · 2 vCPU, 4 GB RAM');
    expect(
      isDeclinedWebSearchError({
        code: 'web_search_not_performed',
        message: DECLINED_WEB_SEARCH_ANSWER,
      }),
    ).toBe(true);
    expect(artifactKindLabel('presentation')).toBe('Slides');
    expect(connectorRiskClass('stripe')).toBe('high-impact');
    expect(catalogConnectorName('hubspot')).toBe('HubSpot');
    expect(describeMcpTool('mcp__hubspot__list_deals')?.serverLabel).toBe('HubSpot');
    expect(connectorAccessSentence(connectorRiskClass('google-contacts'))).toContain(
      'not to change anything there',
    );
    expect(
      buildSlideEditRequest({
        title: 'Plan',
        slideIndex: 0,
        slideCount: 2,
        slide: '# Goals',
        instruction: 'Shorter',
      }),
    ).toContain('Change only slide 1 of 2');
    expect(
      connectorOutcomeNotice({
        connectorId: 'gmail',
        connectorLabel: 'Gmail',
        toolName: 'search',
        failure: 'authorization',
      }).title,
    ).toBe('Gmail needs to be reconnected');
    expect(conversationToolGrantPath('chat-1', 'grant-1')).toBe(
      '/api/chat/conversations/chat-1/tool-grants/grant-1',
    );
    expect(conversationToolGrantRevokeConfirmation('Search').confirmLabel).toBe('Stop allowing');
  });

  it('loads the wave 3 pass 3 entries', () => {
    const report = {
      title: 'Node status',
      summary: 'Node 24 is LTS.',
      content: 'Body [1].',
      citations: [{ id: '1', title: 'Node', url: 'https://nodejs.org', accessedAt: '' }],
      keyFindings: ['v24 is LTS'],
    };
    expect(researchReportToMarkdown(report)).toBe(
      '# Node status\n\nNode 24 is LTS.\n\n## Key findings\n- v24 is LTS\n\nBody [1].\n\n## Sources\n1. [Node](https://nodejs.org)',
    );
    expect(researchReportFollowUpPrompt(report, 'Why?')).toContain('<research_report>');
    expect(researchReportFilename(report)).toBe('node-status');
    expect(parseResearchPlanQuestions({ questions: [' Which country? '] })).toEqual([
      'Which country?',
    ]);
    expect(researchAnswersGuidance(['Which country?'], ['Norway'])).toBe(
      'Q: Which country?\nA: Norway',
    );
    expect(parseResearchRunConfig({ run: { files: true } })?.sources.files).toBe(true);
    const deck = parseDeck('# One\n\n---\n\n# Two');
    expect(deck.slides).toEqual(['# One', '# Two']);
    expect(serializeDeck(deck)).toBe('<!-- deck -->\n\n# One\n\n---\n\n# Two\n');
    expect(NEW_SLIDE_MARKDOWN).toBe('## New slide\n\n- First point\n- Second point');
    const selection = captureSelectionContext('Intro. The plan. End.', 'The plan');
    expect(selection).toEqual({ text: 'The plan', before: 'Intro. ', after: '. End.' });
    expect(
      buildArtifactSelectionRequest({ title: 'Doc', selection, instruction: 'Shorter' }),
    ).toContain('Edit the artifact "Doc". Change only the selected passage');
  });

  it('loads the wave 3 pass 4 entries', () => {
    expect(describeMcpTool('mcp__github__create_issue')).toMatchObject({
      serverLabel: 'GitHub',
      toolLabel: 'Create Issue',
    });
    expect(
      turnDeclinedSearch({
        entries: [{ kind: 'tool', category: 'web-search', approval: { decision: 'denied' } }],
      }),
    ).toBe(true);
  });
});
