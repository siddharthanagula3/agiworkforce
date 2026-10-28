import { describe, expect, it } from 'vitest';

import {
  EXPLICIT_SEARCH_INTENT_PHRASES,
  detectExplicitWebSearchIntent,
  explicitWebSearchSignals,
  explicitlyRefusedItems,
  hasExplicitWebFetchIntent,
  hasExplicitWebSearchOptOut,
  hasExplicitWebSearchIntent,
} from '../explicit-search-intent';

const EM_DASH = String.fromCodePoint(0x2014);

const AUDIT_PROMPT_R06 =
  'AUDIT-RENDER2 R06. No search and do not open any links. Show this URL once as a bare link and once as a Markdown link labelled Synthetic long URL: https://example.com/audit/very-long-path-segment-for-layout-checking/another-long-path-segment?label=abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789 . Then show this exact unbroken token in inline code: AUDIT_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 . No other prose.';

describe('detectExplicitWebSearchIntent', () => {
  it('reports the search-verb signal for a direct instruction to search', () => {
    expect(detectExplicitWebSearchIntent('Search the web for the Reuters top story')).toBe(
      'search_verb',
    );
    expect(detectExplicitWebSearchIntent('can you look this up for me')).toBe('search_verb');
    expect(detectExplicitWebSearchIntent('Look up the current CEO')).toBe('search_verb');
    expect(
      detectExplicitWebSearchIntent('Run two separate web searches for the official RFC pages'),
    ).toBe('search_verb');
  });

  it('reports the search-verb signal when the user names the web or the internet as the place to search', () => {
    expect(
      detectExplicitWebSearchIntent('can you search in the web and tell me his linkedin'),
    ).toBe('search_verb');
    expect(detectExplicitWebSearchIntent('search the internet for his company')).toBe(
      'search_verb',
    );
    expect(detectExplicitWebSearchIntent('please search on the web')).toBe('search_verb');
  });

  it('reports the recency signal for a question that only current data answers', () => {
    expect(detectExplicitWebSearchIntent("what is today's exchange rate")).toBe('recency');
    expect(detectExplicitWebSearchIntent('give me the latest release notes')).toBe('recency');
    expect(detectExplicitWebSearchIntent('what is in the news about the merger')).toBe('recency');
  });

  it('reports the sources signal when the user asks for links or citations', () => {
    expect(detectExplicitWebSearchIntent('explain this and cite sources')).toBe('sources');
    expect(detectExplicitWebSearchIntent('summarise it with citations')).toBe('sources');
    expect(detectExplicitWebSearchIntent('answer and give me the link')).toBe('sources');
  });

  it('reads a request to link a chat or message the user owns as no request for web sources', () => {
    for (const text of [
      'Find our Velvet Kestrel discussion and identify/link the source chat if available.',
      'Link the source conversation for that decision.',
      'Which message said that? Link the source message.',
      'Give me the link to the chat where we planned the picnic.',
      'Send me the link to our earlier conversation.',
      'Can you give me the link to the Velvet Kestrel chat?',
    ]) {
      expect(detectExplicitWebSearchIntent(text)).toBeNull();
    }
    expect(detectExplicitWebSearchIntent('Summarise the RFC and link the source.')).toBe('sources');
    expect(detectExplicitWebSearchIntent('Explain it and link to the source page.')).toBe(
      'sources',
    );
  });

  it.each([
    ['notes the user answers from', 'Answer from my notes and link to the source document.'],
    ['uploaded files', 'Using my uploaded files, summarise the plan and cite sources.'],
    ['a link to a file in the notes', 'Check my notes and give me the link to the source file.'],
    ['a project document', 'Based on our project documents, cite sources for each claim.'],
  ])('reads a sources request scoped to %s as no request for web sources', (_shape, text) => {
    expect(detectExplicitWebSearchIntent(text)).toBeNull();
  });

  it.each([
    ['own notes that name the web', 'Answer from my notes and cite sources from the web.'],
    [
      'own notes compared with a public report',
      'Compare my notes with the official report and link to the source.',
    ],
    ['own notes beside a search verb', 'Check my notes, then search the web and cite sources.'],
  ])('keeps the web signal for %s', (_shape, text) => {
    expect(detectExplicitWebSearchIntent(text)).not.toBeNull();
  });

  it.each([
    [
      'a source document for a public study',
      'Link to the source document for the study you mentioned',
    ],
    ['a notes line under the request', 'Answer with sources\nNotes: keep it short'],
    ['a files line under the request', 'Cite sources\nfiles: none'],
    ['a chat noun on the next line', 'Cite sources\nChat summary: keep it short'],
    ['a link request for a page', 'Send me the link to the official announcement.'],
  ])('keeps the sources signal for %s (MEM-6)', (_shape, text) => {
    expect(detectExplicitWebSearchIntent(text)).toBe('sources');
  });

  it.each([
    ['a long gap after a source phrase', `link the source${' '.repeat(150_000)}x`],
    ['many source phrases naming a chat', `${'link the source chat, '.repeat(20_000)}end`],
    ['a long gap after a link request', `send me the link to${' '.repeat(150_000)}x`],
    [
      'a long run of words after a link request',
      `give me the link to${' the'.repeat(50_000)} chat`,
    ],
    ['many link requests naming a chat', `${'give me the link to the chat, '.repeat(20_000)}end`],
    ['a long word after a link request', `send me the link to ${'a'.repeat(150_000)} chat`],
    ['many own-content scopes', `cite sources ${'from my own saved '.repeat(20_000)}end`],
    ['a long gap inside an own-content scope', `cite sources from my${' '.repeat(150_000)}x`],
  ])('reads a pasted message with %s in linear time', (_shape, text) => {
    const startedAt = performance.now();
    detectExplicitWebSearchIntent(text);
    expect(performance.now() - startedAt).toBeLessThan(2000);
  });

  it('prefers the search verb when a turn carries more than one signal', () => {
    expect(detectExplicitWebSearchIntent('search the web for the latest, cite sources')).toBe(
      'search_verb',
    );
  });

  it('returns null for turns that ask for no outside information', () => {
    for (const text of [
      'write me a haiku about rain',
      'refactor this function to use a map',
      'why does my test fail with a TypeError',
      'translate the paragraph above into French',
      '',
    ]) {
      expect(detectExplicitWebSearchIntent(text)).toBeNull();
    }
  });

  it('does not fire on a phrase embedded inside a longer word', () => {
    expect(detectExplicitWebSearchIntent('the currently_running flag')).toBeNull();
    expect(detectExplicitWebSearchIntent('rename latestValue to newestValue')).toBeNull();
  });

  it('treats an explicit instruction not to search as a refusal, not a search request', () => {
    for (const text of [
      'Now reply exactly. Do not search the web or run code.',
      "Don't search online; answer from the conversation.",
      'Answer without web search, even if the subject is current.',
    ]) {
      expect(hasExplicitWebSearchOptOut(text)).toBe(true);
      expect(detectExplicitWebSearchIntent(text)).toBeNull();
    }
  });

  it('matches regardless of case and surrounding punctuation', () => {
    expect(hasExplicitWebSearchIntent('LOOK UP: the spec')).toBe(true);
    expect(hasExplicitWebSearchIntent('(today) what shipped?')).toBe(true);
  });

  it('matches every phrase it publishes', () => {
    for (const [signal, phrases] of Object.entries(EXPLICIT_SEARCH_INTENT_PHRASES)) {
      for (const phrase of phrases) {
        expect(hasExplicitWebSearchIntent(phrase)).toBe(true);
      }
      expect(phrases.length).toBeGreaterThan(0);
      expect(signal.length).toBeGreaterThan(0);
    }
  });
});

describe('hasExplicitWebSearchOptOut', () => {
  it.each([
    [
      'AUTH-06',
      'AUDIT 2026-10-12. Turn this fictional note into a friendly customer email under 70 words. Keep the date and time exact, do not invent details, and do not search: The library repair workshop moved from Tuesday 13 October to Thursday 15 October 2026, 3 pm. Existing bookings stay valid. Reply only with the email.',
    ],
    [
      'AUTH-07',
      'AUDIT 2026-10-12. Return only valid JSON, no markdown or explanation: an object with keys total and labels. total is 7+8. labels is the array ["red","blue"]. This is self-contained; do not search.',
    ],
    [
      'AUTH-18',
      'AUDIT 2026-10-12. In one short sentence, tell me what information you need to help plan a workshop. No search.',
    ],
    [
      'R4-T03',
      'AUDIT ROUND4. Use an available presentation skill to create a three-slide editable deck for a fictional community repair workshop. Slide 1: Repair Together, 15 October 2026 at 3 pm. Slide 2: Bring one broken small household item; tools are provided. Slide 3: Three steps: check in, diagnose, repair. Use a restrained black-and-white design and one simple diagram. No invented venue, photos, search or publishing.',
    ],
    [
      'AUTH-02',
      'AUDIT 2026-10-12 controlled test. Use only these supplied numbers. Do not search the web. Orders are $18, $27 and $35. Apply 10% discount to the subtotal, then 5% tax to the discounted amount. Reply in exactly four lines: subtotal, discount, tax, final total. No introduction or notes.',
    ],
    [
      'AUTH-03',
      'Now change only the discount to 25%. Keep the same orders and tax. No search. Exactly the same four-line format.',
    ],
    [
      'AUTH-09',
      'AUDIT 2026-10-12. Generate a photorealistic square image of a yellow ceramic mug on a plain blue tabletop, soft daylight. Use the selected image generator. Do not create SVG or code, and do not search the web.',
    ],
    [
      'AUTH-12',
      'AUDIT 2026-10-12. Using only this fictional data, show four compact sections, without web search: 1) an email draft under 40 words inviting Sam to a workshop on 15 October at 3 pm; 2) a Markdown table with columns Item, Quantity, Unit price, Total, Notes for mugs (3 at $4) and notebooks (2 at $5), notes "Synthetic audit data"; 3) a fenced Python function add(a,b) that returns a+b; 4) the equation x^2 + y^2 = 25 using displayed math. Do not add research or tool commentary.',
    ],
    [
      'AUTH-15',
      'AUDIT 2026-10-12. Can you access my Gmail inbox or use an installed plugin in this chat right now? Do not connect anything, send anything, or search the web. State only what is actually available and the next step if it is unavailable, in two sentences.',
    ],
    [
      'AUTH-16',
      'Start with one simple example of adding fractions with the same denominator, then ask me one question. Do not reveal its answer yet. No web search.',
    ],
    [
      'AUTH-17',
      'AUDIT 2026-10-12 cancellation test. Write 80 numbered fictional workshop activity ideas, each with two sentences. Use no web search.',
    ],
    [
      'R01',
      'AUDIT-RENDER2 R01. Do not search. Return only a Markdown table with 8 rows and these 6 columns: Item, Owner, Quantity, Unit price, Status, Notes. Use synthetic item names Alpha through Theta, owner Test User, quantities 1 through 8, price $4 each, alternating Ready/Pending. Each Notes cell must contain the exact inline code `audit_item_id_1234567890` followed by this sentence: This deliberately long note checks whether a wide table remains readable without losing any columns.',
    ],
    [
      'R04',
      'AUDIT-RENDER2 R04. No search. Render the following as mathematical notation, not code: inline E=mc^2 in a sentence; a displayed fraction 1/2+1/3=5/6; a 2 by 2 matrix with rows 1,2 and 3,4; an aligned two-line derivation x+2=5 then x=3. Use LaTeX math delimiters. No other explanation.',
    ],
    [
      'R05',
      'AUDIT-RENDER2 R05. Do not search or translate. Reproduce these exact lines as a five-row Markdown table',
    ],
    ['R06', AUDIT_PROMPT_R06],
    [
      'R3-T04',
      'AUDIT-ROUND3 PDF skill test. Create a one-page PDF titled Workshop Checklist. Use only this synthetic content: Prepare 3 mugs and 2 notebooks. Checklist: count supplies; pack the box. No search, images, personal data, sharing or publishing. Return the actual downloadable PDF.',
    ],
    [
      'R3-T06',
      'AUDIT ROUND3 Work visual test. Use only the attached synthetic Workshop Checklist PDF. Make a two-item preparation checklist and a downloadable CSV with columns item,quantity for mugs,3 and notebooks,2. No search, external services, sharing or publishing.',
    ],
    [
      'R4-T01',
      'AUDIT ROUND4. Use your spreadsheet skill for this fictional shop data: Mugs,3,4; Notebooks,2,5; Pens,6,1.50. Create an editable spreadsheet with Item, Quantity, Unit price and Line total, a working SUM grand total, and sensible currency formatting. Tell me which skill actually ran. Do not search or connect any service.',
    ],
    [
      'R4-T04',
      'AUDIT ROUND4. From these synthetic counts only, show a compact table, a labelled bar chart and a downloadable CSV together: North 12, South 7, East 15, West 9. Then write a two-sentence summary. Keep every value consistent. No search or external tools that contact other services.',
    ],
    ['R4-T07', 'Include a short Python code block below. No search or commentary.'],
    [
      'R10-Q01',
      'AUDIT ROUND10: synthetic renderer fidelity test. Do not use tools, web search, connected services, files, images, video, or artifacts. Reply with exactly the following Markdown, preserving the fenced bodies byte-for-byte. No introduction or conclusion.',
    ],
    [
      'TOOLS-01',
      'AUDIT ROUND11 cancellation test R11-STOP-31. Write a long ordinary fictional story about a repair workshop on a rainy afternoon, in exactly 80 numbered paragraphs of about 30 words each. Keep writing directly in the chat, without a file, artifact, code, tools, skills, web search, external services, or real personal information. Use only invented characters and events.',
    ],
    [
      'R13-02',
      'SYNTHETIC UI AUDIT R13. Draft an email, but do not send it or open an email service. Keep it under 100 words. Do not browse, run code, or use external tools.',
    ],
    [
      'R8-I02',
      'Can you find and continue our earlier Juniper Lantern picnic discussion? Use the earlier conversations, not the runbook, saved memory, or web search. Do not change settings or save anything to memory.',
    ],
    ['private history scope', 'Search only my private history for the picnic plan.'],
    ['past chats scope', 'Only search my past chats for the agreed colour.'],
    [
      'MEM-6 H3',
      'AUDIT R12 CHAT HISTORY RETRIEVAL CONTROL. Use only earlier conversation excerpts available in this chat, never saved memories or project files. Find our synthetic Velvet Kestrel excursion and Cobalt Otter workshop discussions. For each, give the agreed code, item count, day, and coordinator, and identify/link the source chat if available. Also check the Ivory Lynx regatta, which may have no discussion. Say unavailable when you cannot retrieve a fact; do not infer or invent it. Do not browse the public web, run code, call external services, or save memories. Keep the answer brief.',
    ],
    [
      'MEM-6 H5',
      'Cobalt Otter workshop: search earlier conversations in this project for this synthetic AUDIT R12 discussion. Give its agreed code, item count, day, and coordinator, and identify/link the source chat if available. Also check our standalone Velvet Kestrel excursion and the possibly nonexistent Ivory Lynx regatta, with the same fields. Use prior chat excerpts only, not saved memory or project files. Say unavailable when not retrievable; do not guess. Do not browse the public web, run code, call external services, or save memories.',
    ],
  ])('recognises the opt-out in audit prompt %s', (_fixture, prompt) => {
    expect(hasExplicitWebSearchOptOut(prompt)).toBe(true);
    expect(detectExplicitWebSearchIntent(prompt)).toBeNull();
  });

  it.each([
    [
      'AUTH-13',
      "AUDIT 2026-10-12. Search the public web now. On AGI Workforce's official pricing page, what is the current advertised monthly price of Basic? Quote the price exactly, link the official page, and distinguish monthly from yearly billing. Keep the answer under 90 words; if you cannot verify it live, say so.",
    ],
    [
      'R12',
      'AUDIT-RENDER2 R12. Search the public web for the official W3C WCAG 2.2 overview. In under 70 words state its purpose and provide an inline citation/link to the official W3C page. Do not cite unrelated domains. If live search is unavailable say so, and do not invent a citation.',
    ],
  ])('finds no refusal in audit prompt %s, which asks for a search', (_fixture, prompt) => {
    expect(hasExplicitWebSearchOptOut(prompt)).toBe(false);
  });

  it.each([
    'no search',
    'Do not search.',
    "don't search",
    'Don’t search, just answer from what I pasted.',
    'dont search just answer',
    'Answer without searching.',
    'no browsing',
    'No searching or browsing, please.',
    'Answer from memory: no tools, search or citations.',
    'no tools, citations or search',
    'No tools and no search.',
    'No external search needed.',
    "Don't search on the web for this.",
    'Do not search in the internet, I only want your view.',
    'No browsing the web for this one.',
    "Don't google it, tell me what you think.",
    "Don't check online; use the table above.",
    'Never search for anything.',
    'Summarise the latest draft I pasted, and do not search.',
    'Give me today’s plan from my notes. No search.',
    `Answer directly ${EM_DASH} no search.`,
    'No search – just the four lines.',
    'Rules:\n- No search\n- Under 70 words',
    'Keep it short, and no search please.',
    "Don't search yet, tell me your plan first.",
    'No search this time.',
    'No need to search.',
    'No search is needed here.',
    "Don't look up anything, use what you know.",
    'Do not look anything up.',
    "I don't want you to search the web for this.",
    "You don't have to search, just answer.",
    'Do not use search.',
    'Answer without using the search tool.',
    "Don't run any searches.",
    'Do not use tools, browse, or search.',
    'Do not call tools or search.',
    'Do not search or look it up.',
    "Don't google it or look it up.",
    'If unsure, don’t guess or search the web.',
    'This is self-contained so do not search.',
    'Please just don’t search.',
    'No search for this one, please.',
    'No search for now.',
    'No search today.',
    'No search on this one.',
    'No googling.',
    'Rules:\n* No search\n* Under 70 words',
    'Rules:\n• No search\n• Under 70 words',
    'Rules:\n1) No search\n2) Under 70 words',
    '**No search.** Just answer.',
    'Constraints: **no search**, JSON only.',
    '> No search',
    'Do not search (this is self-contained).',
    'Do not search…',
    'Summarise this \n\nNo search',
    'Line one\r\n\r\nNo search\r\n',
    'Do not browse the public web.',
    "Don't search the public web, answer from my notes.",
    'Answer without searching the public internet.',
    'Do not run code or browse the public web.',
    'No public web search please.',
    'No public search.',
  ])('reads %j as a refusal', (text) => {
    expect(hasExplicitWebSearchOptOut(text)).toBe(true);
    expect(detectExplicitWebSearchIntent(text)).toBeNull();
  });

  it.each([
    "Don't search the web. Look up the value in the table I pasted.",
    'Answer without web search, then look it up in the attached glossary.',
  ])('keeps reading %j as a refusal, because it rules out the web by name', (text) => {
    expect(hasExplicitWebSearchOptOut(text)).toBe(true);
    expect(detectExplicitWebSearchIntent(text)).toBeNull();
  });

  it.each([
    ['Search the web for the phrase "no search results"', 'search_verb'],
    ["don't search my email, search the web", 'search_verb'],
    ['Search the web without filters for mechanical keyboards', 'search_verb'],
    ['Search the web for the Reuters top story', 'search_verb'],
    ['Why does my query return no search results? Look it up.', 'search_verb'],
    ['My app has no search. Look up a library that adds one.', 'search_verb'],
    [
      'The dashboard has no filters, search or sorting. Look up a component library.',
      'search_verb',
    ],
    ['I have no idea how to filter or search. Look up the docs.', 'search_verb'],
    ['I have no idea, search the web and tell me', 'search_verb'],
    ["Don't search and replace by hand; look up the sed syntax.", 'search_verb'],
    ["Don't use search and replace here; look up the regex syntax.", 'search_verb'],
    ["Don't use the search bar, search the web for me instead.", 'search_verb'],
    ["Don't search and replace by hand; use sed.", 'search_verb'],
    ["Don't use search and replace here.", 'search_verb'],
    ["Don't use the search bar on the latest build, it is broken.", 'recency'],
    [
      'The dashboard has no filters, search or sorting. What is the latest component library?',
      'recency',
    ],
    ['No filters or search box yet. What is the latest design?', 'recency'],
    ['It keeps no browsing history, what is the latest on that?', 'recency'],
    ['What does "do not search" mean in a robots file? Cite sources.', 'sources'],
    ['Search the web for this phrase: no search results', 'search_verb'],
    ['No search results came up. Look it up again.', 'search_verb'],
    ['No search results came up, what changed today?', 'recency'],
    ['No search for that term returns anything. Why?', 'search_verb'],
    ['My app has no sorting or search. Look up a library that adds them.', 'search_verb'],
    ['My app has no sorting or search. What is the latest library for that?', 'recency'],
    ['No idea how to filter or search. Look up the docs.', 'search_verb'],
    ['No idea how to filter or search. Cite sources.', 'sources'],
    ['No sorting or search yet. Look up a library that adds them.', 'search_verb'],
    ['No search, no problem. Look up the lyrics.', 'search_verb'],
    ['No problem, search or look it up whenever.', 'search_verb'],
    [
      'Staff must do no searching, or personal browsing on work devices. What is the latest guidance?',
      'recency',
    ],
    ["Don't search just my email, search the web", 'search_verb'],
    ['You never search. Look up the current CEO.', 'search_verb'],
    ['You never search. What is the latest on the merger?', 'recency'],
    ['Why do you never search? Search the web for the Reuters top story.', 'search_verb'],
    ["You don't search, you guess. Look it up this time.", 'search_verb'],
    [
      "If you don't search, you will get this wrong. Search the web for the Reuters top story.",
      'search_verb',
    ],
    ['People do not search. Cite sources for that claim.', 'sources'],
    ["I can't answer this without searching. Search the web for me.", 'search_verb'],
    ["I can't verify this without checking online, please look it up.", 'search_verb'],
    ['Without browsing, can you tell me the latest price? If not, search the web.', 'search_verb'],
    ["Don't check the web app, look up the API docs", 'search_verb'],
    ["Don't hesitate to ask questions or search the web.", 'search_verb'],
    ["Don't just guess or search the web.", 'search_verb'],
    ["If you don't know, say so, or search the web.", 'search_verb'],
    ["Don't guess, check the docs or search the web.", 'search_verb'],
    [`Don't guess ${EM_DASH} check the docs or search the web.`, 'search_verb'],
    ["Don't use Bing, search the web with Google, or look it up.", 'search_verb'],
    [
      "Don't guess or search the web for rumours; search the web for official sources.",
      'search_verb',
    ],
  ] as const)('still allows a search for %j', (text, signal) => {
    expect(hasExplicitWebSearchOptOut(text)).toBe(false);
    expect(detectExplicitWebSearchIntent(text)).toBe(signal);
  });

  it.each([
    'search without filters',
    'Do not search unless you need to.',
    'AUDIT 2026-10-12. I run a small print shop. Three orders are $18, $27 and $35. A 10% discount applies to the subtotal, then 5% tax applies to the discounted amount. Show the subtotal, discount, tax and final total in four short lines.',
    'write me a haiku about rain',
    'No problem, thanks.',
    'There is no search engine I trust.',
    'Do not use tools, web search or code until I say so, then search the web.',
    'Search my past chats and the web for the agreed colour.',
    '',
  ])('finds no refusal in %j', (text) => {
    expect(hasExplicitWebSearchOptOut(text)).toBe(false);
  });

  it.each([
    ['a long gap after the search noun', `No search${' '.repeat(150_000)}x`],
    ['a long gap inside a refused list', `No venue, search,${' '.repeat(150_000)}x`],
    ['a long gap before the last list item', `No venue or search${' '.repeat(150_000)}x`],
    [
      'a long comma list that never names search',
      `${'no venue, photos, catering, parking, seating, signage, '.repeat(4000)}end`,
    ],
    ['a run of blank lines', `${'\n'.repeat(60_000)}x`],
    ['a run of Windows blank lines', `${'\r\n'.repeat(60_000)}x`],
    ['a run of indented blank lines', `${'\n '.repeat(60_000)}x`],
    ['blank lines inside the text', `Summarise this log.\n${'\n'.repeat(60_000)}end of log`],
    ['many refused alternatives that are not a search', `Do not a${' or searchx'.repeat(15_000)}`],
    ['a long gap after the public qualifier', `Do not browse the public${' '.repeat(150_000)}x`],
    [
      'a long gap after a public search qualifier',
      `Do not search the public${' '.repeat(150_000)}x`,
    ],
    ['a long gap after a refused public noun', `No public${' '.repeat(150_000)}x`],
    ['a long gap after a refused public web noun', `No public web${' '.repeat(150_000)}x`],
    [
      'a long list closed by a refused public noun',
      `${'no venue, photos, catering, parking, seating, signage, '.repeat(4000)}or public`,
    ],
  ])('reads a pasted message with %s in linear time', (_shape, text) => {
    const startedAt = performance.now();
    expect(hasExplicitWebSearchOptOut(text)).toBe(false);
    expect(performance.now() - startedAt).toBeLessThan(2000);
  });
});

describe('explicitlyRefusedItems', () => {
  it.each([
    [
      'Do not use tools, web search, connected services, files, images, video, or artifacts.',
      ['tools', 'web search', 'connected services', 'files', 'images', 'video', 'artifacts'],
    ],
    ['Do not browse, run code, or use external tools.', ['browse', 'code', 'tools']],
    ['Do not browse , run code ,  or use external tools.', ['browse', 'code', 'tools']],
    ["Don't search the web\tor run code, just answer.", ['search the web', 'code']],
    ['Answer from memory. No tools at all.', ['tools']],
    ["Don't search the web or run code, just answer.", ['search the web', 'code']],
    ["Don't guess, check the docs or search the web.", ['guess']],
    ["Don't hesitate to run code.", []],
    ['You never run code. Run it now.', []],
    ['Do not use tools unless you need to.', ['tools unless you need to']],
  ])('reads the refused items of %j', (text, items) => {
    expect(explicitlyRefusedItems(text)).toEqual(items);
  });
});

describe('hasExplicitWebFetchIntent', () => {
  it('requires a URL and a request to inspect its contents', () => {
    expect(hasExplicitWebFetchIntent('Summarize https://www.iana.org/help/example-domains')).toBe(
      true,
    );
    expect(
      hasExplicitWebFetchIntent('Open this URL: https://www.iana.org/help/example-domains'),
    ).toBe(true);
    expect(hasExplicitWebFetchIntent('A URL I remember is https://www.iana.org/')).toBe(false);
    expect(hasExplicitWebFetchIntent('Summarize this text, no link supplied.')).toBe(false);
  });

  it('does not fetch a URL when the user explicitly forbids opening it', () => {
    expect(
      hasExplicitWebFetchIntent('Do not open this URL: https://example.com. Summarize my note.'),
    ).toBe(false);
  });

  it('does not fetch for audit prompt R06, which forbids opening any link', () => {
    expect(hasExplicitWebFetchIntent(AUDIT_PROMPT_R06)).toBe(false);
    expect(
      hasExplicitWebFetchIntent('Do not open any other tabs, just read https://example.com/report'),
    ).toBe(true);
  });
});

describe('explicitWebSearchSignals', () => {
  it('reports every signal, where detection stops at the first', () => {
    const text = 'summarise the latest AI news with sources';

    expect(detectExplicitWebSearchIntent(text)).toBe('recency');
    expect(explicitWebSearchSignals(text)).toEqual(['recency', 'sources']);
  });

  it('reports nothing for an opt-out or plain text', () => {
    expect(explicitWebSearchSignals('do not search the web, answer from memory')).toEqual([]);
    expect(explicitWebSearchSignals('rewrite this paragraph')).toEqual([]);
  });
});
