import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import type { Options } from 'react-markdown';

// Kept apart from MarkdownContent so splitMarkdownBlocks can share the exact
// plugin list without pulling the renderer - and with it every syntax grammar,
// KaTeX and the icon set - into a module that only needs to parse.
export const REMARK_PLUGINS = [
  remarkGfm,
  remarkMath,
  remarkBreaks,
] satisfies Options['remarkPlugins'];
