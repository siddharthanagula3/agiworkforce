import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { deriveFollowUps, FollowUpSuggestions } from './FollowUpSuggestions';

describe('deriveFollowUps() · guard clauses', () => {
  it('returns [] for empty string', () => {
    expect(deriveFollowUps('', 0)).toEqual([]);
  });

  it('returns [] for whitespace-only string', () => {
    expect(deriveFollowUps('   \n\t  ', 0)).toEqual([]);
  });

  it('returns [] when content is exactly 19 chars (< 20 threshold)', () => {
    expect(deriveFollowUps('x'.repeat(19), 0)).toEqual([]);
  });

  it('returns results when content is exactly 20 chars', () => {
    const result = deriveFollowUps('x'.repeat(20), 0);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('deriveFollowUps() · topic patterns', () => {
  it('matches code-related pattern (function keyword)', () => {
    const result = deriveFollowUps(
      'Here is a function that handles the request and returns a response.',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('Can you add unit tests for this?');
  });

  it('matches class keyword in code pattern', () => {
    const result = deriveFollowUps('This class extends the base component.', 0);
    const texts = result.map((f) => f.text);
    expect(
      texts.some((t) =>
        [
          'Can you add unit tests for this?',
          'How would you handle error cases?',
          'Can you optimize this for performance?',
        ].includes(t),
      ),
    ).toBe(true);
  });

  it('matches bug/error pattern', () => {
    const result = deriveFollowUps(
      'There is an error in your code. The bug occurs in the exception handler.',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('What could cause this to happen again?');
  });

  it('matches list/steps pattern (numbered list)', () => {
    const result = deriveFollowUps(
      'Follow these steps:\n1. Install dependencies\n2. Configure environment\n3. Run tests',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('Can you go deeper on one of these points?');
  });

  it('matches list/steps pattern (bullet points)', () => {
    const result = deriveFollowUps(
      'Consider the following points:\n- Item one\n- Item two\n- Item three',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('Can you go deeper on one of these points?');
  });

  it('matches strategy/plan pattern', () => {
    const result = deriveFollowUps(
      'Here is a strategy for your roadmap and overall approach to the framework.',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('What are the potential risks?');
  });

  it('matches comparison/vs pattern', () => {
    const result = deriveFollowUps(
      'React vs Angular: a comparison of the differences, pros and cons, and trade-offs.',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('Which would you recommend for my use case?');
  });

  it('matches explanation/concept pattern', () => {
    const result = deriveFollowUps(
      'Photosynthesis means the process where plants convert sunlight into energy. In other words it refers to food production.',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('Can you give a real-world example?');
  });

  it('matches health/fitness pattern', () => {
    const result = deriveFollowUps(
      'This workout routine focuses on cardiovascular exercise, calorie tracking, and sleep quality for overall wellness.',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('Can you adjust this for a beginner?');
  });

  it('matches finance pattern', () => {
    const result = deriveFollowUps(
      'Your investment portfolio and budget should account for savings and tax implications.',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('What is the risk level of this approach?');
  });

  it('matches writing pattern', () => {
    const result = deriveFollowUps(
      'Here is a draft article for your blog. The content covers email marketing.',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('Can you make this more concise?');
  });

  it('matches database/SQL pattern', () => {
    const result = deriveFollowUps(
      'This SQL query joins the users table with the orders schema and uses a postgres index.',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('How can I optimize this query?');
  });

  it('keeps map-result URLs from producing database or API suggestions', () => {
    const result = deriveFollowUps(
      '[Millennium Park, Chicago](https://www.google.com/maps/search/?api=1&query=Millennium+Park+Chicago)',
      0,
    );

    expect(result.map((followUp) => followUp.text)).toEqual([
      'What are the best things to do nearby?',
      'How do I get there?',
      'What should I know before visiting?',
    ]);
  });

  it('matches DevOps/deployment pattern', () => {
    const result = deriveFollowUps(
      'Deploy this docker container using kubernetes and a ci/cd pipeline with terraform infrastructure.',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('How would I set up monitoring for this?');
  });

  it('matches security pattern', () => {
    const result = deriveFollowUps(
      'This endpoint handles authentication and authorization using JWT and OAuth to prevent XSS and CSRF.',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('What other attack vectors should I consider?');
  });

  it('matches testing pattern', () => {
    const result = deriveFollowUps(
      'Write a unit test spec with vitest assertions and mock stubs for coverage.',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('What edge cases should I add tests for?');
  });

  it('does not treat a project recall test as software testing or machine learning', () => {
    const result = deriveFollowUps(
      'The project serves as an investor demo recall test to store and retrieve specific launch details.',
      0,
    );
    const texts = result.map((followUp) => followUp.text);

    expect(texts).not.toContain('What edge cases should I add tests for?');
    expect(texts).not.toContain('How can I reduce overfitting?');
    expect(texts).toEqual([
      'Can you give an example?',
      'What are the next steps?',
      'How can I apply this?',
    ]);
  });

  it('matches API/REST pattern', () => {
    const result = deriveFollowUps(
      'This REST api endpoint handles the HTTP request payload and the middleware route response.',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('How should I handle rate limiting?');
  });

  it('matches data science/ML pattern', () => {
    const result = deriveFollowUps(
      'Train the neural network model on the dataset to improve accuracy and reduce gradient regression.',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('How can I reduce overfitting?');
  });
});

describe('deriveFollowUps() · scoring against the user question', () => {
  const PHONE_QUESTION = 'Find me the best Android smartphone deals ranked by price.';
  const PHONE_ANSWER =
    '**Pixel 11 at Google** is the newest option, but the $549 figure requires an eligible ' +
    'trade-in. Without a trade-in, budget for roughly **$899**. The Google Fi promotion can ' +
    'lower the effective cost further, but only through 24 months of service credits.';

  it('does not offer finance follow-ups because a phone answer said "budget" once', () => {
    const texts = deriveFollowUps(PHONE_ANSWER, 4, PHONE_QUESTION).map((f) => f.text);

    expect(texts).not.toContain('What is the risk level of this approach?');
    expect(texts).not.toContain('How should I adjust this based on my income?');
    expect(texts).not.toContain('Are there any tax implications?');
  });

  it('still offers finance follow-ups when the user actually asked about money', () => {
    const texts = deriveFollowUps(
      'Your portfolio should balance savings against tax on the income you draw.',
      4,
      'How should I invest my savings this year?',
    ).map((f) => f.text);

    expect(texts).toContain('What is the risk level of this approach?');
  });

  it('lets a single incidental keyword through when there is no user question to check', () => {
    const texts = deriveFollowUps(PHONE_ANSWER, 4).map((f) => f.text);

    expect(texts).toContain('What is the risk level of this approach?');
  });

  it('prefers the topic with the most distinct hits over the first one in the list', () => {
    const texts = deriveFollowUps(
      'The function returns a response. The query joins the orders table on the postgres ' +
        'schema and the index needs care.',
      2,
      'How do I speed up this sql query?',
    ).map((f) => f.text);

    expect(texts).toContain('How can I optimize this query?');
    expect(texts).not.toContain('Can you add unit tests for this?');
  });

  it('falls back to generic follow-ups when nothing clears the bar', () => {
    const texts = deriveFollowUps(PHONE_ANSWER, 4, PHONE_QUESTION).map((f) => f.text);
    const generic = [
      'Tell me more about this',
      'Can you give an example?',
      'What are the next steps?',
      'How can I apply this?',
      'What should I watch out for?',
      'Can you summarize the key points?',
    ];

    for (const text of texts) expect(generic).toContain(text);
  });
});

describe('deriveFollowUps() · suggestion types', () => {
  it('assigns "apply" type to "Can you add unit tests for this?"', () => {
    const result = deriveFollowUps('Here is a class that implements the component logic.', 0);
    const fu = result.find((f) => f.text === 'Can you add unit tests for this?');
    expect(fu?.type).toBe('apply');
  });

  it('assigns "deeper" type to "What could cause this to happen again?"', () => {
    const result = deriveFollowUps('There is a bug causing a crash error exception.', 0);
    const fu = result.find((f) => f.text === 'What could cause this to happen again?');
    expect(fu?.type).toBe('deeper');
  });

  it('assigns "discover" type to "Are there any related issues I should check?"', () => {
    const result = deriveFollowUps('The debug session revealed an issue causing a crash.', 0);
    const fu = result.find((f) => f.text === 'Are there any related issues I should check?');
    expect(fu?.type).toBe('discover');
  });
});

describe('deriveFollowUps() · capability discovery', () => {
  it('adds "Run this code" pill when response contains a code block', () => {
    const contentWithCode = [
      'Here is the solution to your problem.',
      '```javascript',
      'const x = 42;',
      'console.log(x);',
      '```',
    ].join('\n');
    const result = deriveFollowUps(contentWithCode, 0);
    const texts = result.map((f) => f.text);
    expect(texts).toContain('Run this code');
  });

  it('"Run this code" has type "apply"', () => {
    const contentWithCode = '```python\nprint("hello world")\n```\nThis code prints hello.';
    const result = deriveFollowUps(contentWithCode, 0);
    const pill = result.find((f) => f.text === 'Run this code');
    expect(pill?.type).toBe('apply');
  });

  it('does NOT add "Run this code" for inline code without a block (too short)', () => {
    const shortBlock = '```x```';
    const content = `Here is something short: ${shortBlock} and more explanation text here.`;
    const result = deriveFollowUps(content, 0);
    const texts = result.map((f) => f.text);
    expect(texts).not.toContain('Run this code');
  });

  it('adds "Search the web to verify" when response contains "according to"', () => {
    const result = deriveFollowUps(
      'According to recent studies show the research indicates data suggests something interesting.',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('Search the web to verify');
  });

  it('adds "Search the web to verify" for "as of 2024" pattern', () => {
    const result = deriveFollowUps(
      'As of 2024 the population has grown significantly according to census data.',
      0,
    );
    const texts = result.map((f) => f.text);
    expect(texts).toContain('Search the web to verify');
  });

  it('"Search the web to verify" has type "discover"', () => {
    const result = deriveFollowUps(
      'According to studies show this is the case in modern research.',
      0,
    );
    const pill = result.find((f) => f.text === 'Search the web to verify');
    expect(pill?.type).toBe('discover');
  });

  it('adds "Summarize this conversation" when messageCount >= 10', () => {
    const result = deriveFollowUps('x'.repeat(25), 10);
    const texts = result.map((f) => f.text);
    expect(texts).toContain('Summarize this conversation');
  });

  it('does NOT add "Summarize this conversation" when messageCount < 10', () => {
    const result = deriveFollowUps('x'.repeat(25), 9);
    const texts = result.map((f) => f.text);
    expect(texts).not.toContain('Summarize this conversation');
  });

  it('"Summarize this conversation" has type "apply"', () => {
    const result = deriveFollowUps('x'.repeat(25), 10);
    const pill = result.find((f) => f.text === 'Summarize this conversation');
    expect(pill?.type).toBe('apply');
  });
});

describe('deriveFollowUps() · deduplication', () => {
  it('does not emit duplicate suggestion texts', () => {
    const content =
      'This function class component handles the error bug. ' +
      'It also has tests and coverage for unit tests and spec assertions.';
    const result = deriveFollowUps(content, 0);
    const texts = result.map((f) => f.text);
    const uniqueTexts = new Set(texts);
    expect(texts.length).toBe(uniqueTexts.size);
  });
});

describe('deriveFollowUps() · content cap at 4000 chars', () => {
  it('processes content longer than 4000 chars without error', () => {
    const longContent = 'function '.padEnd(4001, 'x') + ' class component module';
    expect(() => deriveFollowUps(longContent, 0)).not.toThrow();
  });

  it('matches keyword at position < 4000 even in a very long response', () => {
    const content = 'function doSomething() { '.padEnd(6000, 'y');
    const result = deriveFollowUps(content, 0);
    const texts = result.map((f) => f.text);
    expect(texts).toContain('Can you add unit tests for this?');
  });

  it('does NOT match a keyword placed at position > 4000', () => {
    const neutral = 'a'.repeat(4001);
    const content = neutral + ' function class component';
    const result = deriveFollowUps(content, 0);
    const texts = result.map((f) => f.text);
    expect(texts).not.toContain('Can you add unit tests for this?');
  });
});

describe('deriveFollowUps() · generic fallback', () => {
  it('returns generic suggestions when no topic matches and content >= 20 chars', () => {
    const result = deriveFollowUps('xxxxxxxxxxxxxxxxxxxxxxxxx', 0);
    expect(result.length).toBeGreaterThan(0);
    const genericTexts = [
      'Tell me more about this',
      'Can you give an example?',
      'What are the next steps?',
      'How can I apply this?',
      'What should I watch out for?',
      'Can you summarize the key points?',
    ];
    for (const item of result) {
      expect(genericTexts).toContain(item.text);
    }
  });

  it('uses summary-style generics for long content (> 500 chars)', () => {
    const longNeutral = 'z'.repeat(501);
    const result = deriveFollowUps(longNeutral, 0);
    const texts = result.map((f) => f.text);
    expect(texts).toContain('Tell me more about this');
  });

  it('uses example-style generics for short content (<= 500 chars)', () => {
    const shortNeutral = 'z'.repeat(25);
    const result = deriveFollowUps(shortNeutral, 0);
    const texts = result.map((f) => f.text);
    expect(texts).not.toContain('Tell me more about this');
  });

  it('only fires generic fallback when matched.length < 2', () => {
    const result = deriveFollowUps(
      'Here is a function that does something interesting in the codebase.',
      0,
    );
    const genericOnlySuggestions = ['Tell me more about this', 'Can you give an example?'];
    const texts = result.map((f) => f.text);
    for (const generic of genericOnlySuggestions) {
      expect(texts).not.toContain(generic);
    }
  });
});

describe('deriveFollowUps() · result shape', () => {
  it('returns at most 3 suggestions', () => {
    const content =
      'The function class component handles database SQL query and api endpoint authentication.';
    const result = deriveFollowUps(content, 0);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('assigns stable sequential IDs starting at followup-0', () => {
    const result = deriveFollowUps('Here is a function that handles the request properly.', 0);
    result.forEach((item, i) => {
      expect(item.id).toBe(`followup-${i}`);
    });
  });

  it('each result has id, text, and type fields', () => {
    const result = deriveFollowUps('This function component handles the user request.', 0);
    for (const item of result) {
      expect(typeof item.id).toBe('string');
      expect(typeof item.text).toBe('string');
      expect(['deeper', 'alternative', 'apply', 'discover']).toContain(item.type);
    }
  });
});

describe('FollowUpSuggestions component', () => {
  const CONTENT_WITH_CODE =
    'Here is a function that handles the user request and returns the proper response component.';

  it('renders suggestion pills when conditions are met', () => {
    render(
      <FollowUpSuggestions
        lastAssistantContent={CONTENT_WITH_CODE}
        onSelect={vi.fn()}
        isGenerating={false}
      />,
    );
    expect(screen.getByRole('list')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
  });

  it('returns null when isGenerating is true', () => {
    const { container } = render(
      <FollowUpSuggestions
        lastAssistantContent={CONTENT_WITH_CODE}
        onSelect={vi.fn()}
        isGenerating={true}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when content is too short to generate suggestions', () => {
    const { container } = render(
      <FollowUpSuggestions lastAssistantContent="short" onSelect={vi.fn()} isGenerating={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when content is empty string', () => {
    const { container } = render(
      <FollowUpSuggestions lastAssistantContent="" onSelect={vi.fn()} isGenerating={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls onSelect with pill text when a suggestion is clicked', () => {
    const onSelect = vi.fn();
    render(
      <FollowUpSuggestions
        lastAssistantContent={CONTENT_WITH_CODE}
        onSelect={onSelect}
        isGenerating={false}
      />,
    );

    const pills = screen.getAllByRole('listitem');
    fireEvent.click(pills[0]!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(typeof onSelect.mock.calls[0]?.[0]).toBe('string');
    expect((onSelect.mock.calls[0]?.[0] as string).length).toBeGreaterThan(0);
  });

  it('applies opacity-0 and pointer-events-none when isUserTyping is true', () => {
    const { container } = render(
      <FollowUpSuggestions
        lastAssistantContent={CONTENT_WITH_CODE}
        onSelect={vi.fn()}
        isGenerating={false}
        isUserTyping={true}
      />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper?.className).toMatch(/opacity-0/);
    expect(wrapper?.className).toMatch(/pointer-events-none/);
  });

  it('does not apply fade-out classes when isUserTyping is false', () => {
    const { container } = render(
      <FollowUpSuggestions
        lastAssistantContent={CONTENT_WITH_CODE}
        onSelect={vi.fn()}
        isGenerating={false}
        isUserTyping={false}
      />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper?.className).not.toMatch(/opacity-0/);
    expect(wrapper?.className).not.toMatch(/pointer-events-none/);
  });

  it('hides all pills after clicking the Hide button', () => {
    render(
      <FollowUpSuggestions
        lastAssistantContent={CONTENT_WITH_CODE}
        onSelect={vi.fn()}
        isGenerating={false}
      />,
    );

    const hideBtn = screen.getByRole('button', { name: 'Hide suggestions' });
    fireEvent.click(hideBtn);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hide suggestions' })).not.toBeInTheDocument();
  });

  it('renders the container with accessible role="list" and aria-label', () => {
    render(
      <FollowUpSuggestions
        lastAssistantContent={CONTENT_WITH_CODE}
        onSelect={vi.fn()}
        isGenerating={false}
      />,
    );
    const list = screen.getByRole('list');
    expect(list).toHaveAttribute('aria-label', 'Follow-up suggestions');
  });

  it('passes messageCount to influence summarize pill visibility', () => {
    const { rerender } = render(
      <FollowUpSuggestions
        lastAssistantContent={'x'.repeat(25)}
        onSelect={vi.fn()}
        messageCount={0}
      />,
    );
    let texts = screen.queryAllByRole('listitem').map((el) => el.textContent ?? '');
    expect(texts.some((t) => t.includes('Summarize this conversation'))).toBe(false);

    rerender(
      <FollowUpSuggestions
        lastAssistantContent={'x'.repeat(25)}
        onSelect={vi.fn()}
        messageCount={10}
      />,
    );
    texts = screen.queryAllByRole('listitem').map((el) => el.textContent ?? '');
    expect(texts.some((t) => t.includes('Summarize this conversation'))).toBe(true);
  });
});
