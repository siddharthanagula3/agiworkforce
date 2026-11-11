export const PRODUCT_BRAND = 'AGIWORKFORCE';

export const PRODUCT_COPYRIGHT_NAME = 'AGI';

export const COMPANY_SITE_NAME = 'AGI Workforce';

export const PRODUCT_NAMES = {
  chat: 'Chat',
  mobile: 'Mobile',
  desktop: 'Desktop',
  cli: 'CLI',
  extension: 'Extension',
  code: 'Code',
  work: 'Work',
} as const;

export type ProductKey = keyof typeof PRODUCT_NAMES;

export type ProductName = (typeof PRODUCT_NAMES)[ProductKey];

const LETTER_NAMES_WITH_A_VOWEL_SOUND = 'AEFHILMNORSX';

export function productNameWithArticle(product: ProductKey): string {
  const name = PRODUCT_NAMES[product];
  const firstWord = name.split(' ')[0] ?? name;
  const initial = firstWord.charAt(0).toUpperCase();
  const spelledOut = firstWord.length > 1 && firstWord === firstWord.toUpperCase();
  const vowelSound = spelledOut
    ? LETTER_NAMES_WITH_A_VOWEL_SOUND.includes(initial)
    : 'AEIOU'.includes(initial);
  return `${vowelSound ? 'an' : 'a'} ${name}`;
}
