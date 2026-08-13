import { stripLeadingCurrentPromptEcho } from '../src/features/chat/utils/assistantOutput';

describe('assistant output prompt-echo guard', () => {
  const prompt = 'Compare the three launch options.';

  it('holds an exact partial echo while the response is still streaming', () => {
    expect(stripLeadingCurrentPromptEcho('> *You: Compare the three', prompt)).toBe('');
  });

  it('removes the echoed current prompt and provider separator', () => {
    expect(
      stripLeadingCurrentPromptEcho(`> *You: ${prompt}*\n\n.\n\nHere is the comparison.`, prompt),
    ).toBe('Here is the comparison.');
  });

  it('preserves a different You quotation', () => {
    const response = '> You: A different sentence.\n\nThat is not the current prompt.';
    expect(stripLeadingCurrentPromptEcho(response, prompt)).toBe(response);
  });
});
