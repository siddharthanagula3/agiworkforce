export const MATH_RENDERING_CASES = [
  { name: 'energy', source: String.raw`E = mc^2` },
  { name: 'quadratic', source: String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}` },
  { name: 'bayes', source: String.raw`P(A \mid B) = \frac{P(B \mid A)P(A)}{P(B)}` },
  { name: 'matrix', source: String.raw`\begin{bmatrix} a & b \\ c & d \end{bmatrix}` },
  { name: 'integral', source: String.raw`\int_0^1 x^2\,dx = \frac{1}{3}` },
  { name: 'summation', source: String.raw`\sum_{i=1}^{n} i = \frac{n(n+1)}{2}` },
] as const;

export const MATH_DELIMITERS = [
  { name: 'inline dollar', open: '$', close: '$', display: false },
  { name: 'inline bracket', open: String.raw`\(`, close: String.raw`\)`, display: false },
  { name: 'display dollar', open: '$$', close: '$$', display: true },
  { name: 'display bracket', open: String.raw`\[`, close: String.raw`\]`, display: true },
] as const;

export const MATH_RENDERING_MARKDOWN = MATH_RENDERING_CASES.map(
  ({ name, source }) => `### ${name}\n\nInline $${source}$.\n\n$$\n${source}\n$$\n\n`,
).join('\n');
