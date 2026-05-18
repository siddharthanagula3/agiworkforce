/**
 * features/inline-completions/ — InlineCompletionItemProvider.
 * Triggered on every keystroke (pattern: '**'), gated by agiWorkforce.inlineCompletions.enabled.
 * Caches completions for 15s (up to 16 entries) to avoid redundant API calls.
 */
export { AgiInlineCompletionProvider } from './inlineCompletionProvider';
