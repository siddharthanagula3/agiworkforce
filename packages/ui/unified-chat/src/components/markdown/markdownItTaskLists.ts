import type { MarkdownIt } from 'markdown-it';

const TASK_PREFIX = /^\[([ xX])\][\t ]+/u;

export function markdownItTaskLists(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'assistant_task_lists', (state) => {
    for (const [index, item] of state.tokens.entries()) {
      if (item.type !== 'list_item_open') continue;
      const paragraph = state.tokens[index + 1];
      const inline = state.tokens[index + 2];
      if (paragraph?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;
      const marker = TASK_PREFIX.exec(inline.content);
      const text = inline.children?.[0];
      if (!marker || text?.type !== 'text' || !text.content.startsWith(marker[0])) continue;

      text.content = text.content.slice(marker[0].length);
      item.attrSet('data-task-item', '');
      const checkbox = new state.Token('assistant_task_checkbox', 'span', 0);
      checkbox.content = String(marker[1] !== ' ');
      inline.children?.unshift(checkbox);
    }
  });

  md.renderer.rules['assistant_task_checkbox'] = (tokens, index) => {
    const checked = tokens[index]?.content === 'true';
    return `<span role="checkbox" aria-label="Task" aria-checked="${checked}" aria-disabled="true">${checked ? '☑' : '☐'}</span>`;
  };
}
