import type { FlashcardSet, Quiz } from './study-set';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const LETTERS = 'ABCDEFGH';

const PRINT_STYLE = `body{font:14px/1.5 system-ui,sans-serif;color:black;margin:32px}
h1{font-size:20px;margin:0 0 16px}h2{font-size:16px;margin:24px 0 8px;break-before:page}
ol{padding-inline-start:20px}li{margin:0 0 14px;break-inside:avoid}
.options{list-style:none;padding:0;margin:6px 0 0}.line{border-bottom:1px solid gray;height:24px;margin-top:6px}
table{width:100%;border-collapse:collapse}td{border:1px solid gray;padding:10px;vertical-align:top;width:50%;break-inside:avoid}
.muted{color:dimgray}`;

export function quizPrintHtml(quiz: Quiz): string {
  const title = escapeHtml(quiz.title || 'Quiz');
  const questions = quiz.questions
    .map((question) => {
      const body =
        question.kind === 'multiple_choice'
          ? `<ul class="options">${question.options
              .map((option, index) => `<li>${LETTERS[index]}. ${escapeHtml(option)}</li>`)
              .join('')}</ul>`
          : '<div class="line"></div>';
      return `<li><strong>${escapeHtml(question.question)}</strong>${body}</li>`;
    })
    .join('');
  const key = quiz.questions
    .map((question) => {
      const answer =
        question.kind === 'multiple_choice'
          ? `${LETTERS[question.answer]}. ${escapeHtml(question.options[question.answer] ?? '')}`
          : escapeHtml(question.answer);
      const why = question.explanation
        ? ` <span class="muted">${escapeHtml(question.explanation)}</span>`
        : '';
      return `<li>${answer}${why}</li>`;
    })
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_STYLE}</style></head><body><h1>${title}</h1><ol>${questions}</ol><h2>Answer key</h2><ol>${key}</ol></body></html>`;
}

export function flashcardsPrintHtml(set: FlashcardSet): string {
  const title = escapeHtml(set.title || 'Flashcards');
  const rows = set.cards
    .map((card) => `<tr><td>${escapeHtml(card.front)}</td><td>${escapeHtml(card.back)}</td></tr>`)
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_STYLE}</style></head><body><h1>${title}</h1><table>${rows}</table></body></html>`;
}

export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1_000);
  };
  document.body.appendChild(frame);
}
