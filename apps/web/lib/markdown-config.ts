import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export const defaultRemarkPlugins = [remarkGfm, remarkMath];
export const defaultRehypePlugins = [rehypeKatex];
