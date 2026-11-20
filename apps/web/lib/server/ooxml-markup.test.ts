import { describe, expect, it } from 'vitest';

import {
  attributeValue,
  markupElements,
  openTags,
  replaceMarkupElements,
  xmlAttributes,
} from './ooxml-markup';

describe('xmlAttributes', () => {
  it('reads attributes with whitespace around the equals sign and either quote', () => {
    const tag = `<c r = "A1"\n\tt\n=\n's' s="2">`;
    expect(
      xmlAttributes(tag, 2).map(({ name, value, start, end }) => [
        name,
        value,
        tag.slice(start, end),
      ]),
    ).toEqual([
      ['r', 'A1', 'r = "A1"'],
      ['t', 's', "t\n=\n's'"],
      ['s', '2', 's="2"'],
    ]);
  });

  it('decodes references and normalizes literal whitespace in values', () => {
    expect(
      attributeValue(' v="&#115;&#x41;&lt;&amp;lt;&quot;&apos;&#1114112;&#xD800;\tx"', 'v'),
    ).toBe(`sA<&lt;"'&#1114112;&#xD800; x`);
  });

  it('keeps a closing bracket inside a quoted value and stops at the tag end', () => {
    expect(attributeValue('<c note="a>b" t="s"/><c t="n">', 't', 2)).toBe('s');
    expect(attributeValue('<c r="A1"> t="s"', 't', 2)).toBeUndefined();
  });

  it('matches a whole attribute name, not a suffix of one', () => {
    expect(attributeValue(' xt="a" x:t="b"', 't')).toBeUndefined();
  });
});

function spans(source: string, name: string): string[] {
  return [...markupElements(source, name)].map((element) =>
    source.slice(element.start, element.end),
  );
}

describe('markupElements', () => {
  it('ends an element at a closing tag written with whitespace before its bracket', () => {
    expect(spans('<c r="A1"><v>1</v></c ><c r="B1"><v>2</v></c\n\t>', 'c')).toEqual([
      '<c r="A1"><v>1</v></c >',
      '<c r="B1"><v>2</v></c\n\t>',
    ]);
  });

  it('reads an opening tag with whitespace after its name', () => {
    expect([...markupElements('<v\n>3</v>', 'v')].map((element) => element.body)).toEqual(['3']);
  });

  it('does not take an element whose name only starts with the wanted name', () => {
    expect(spans('<c:chart/><c-x>1</c-x><c.y/><cols/><c r="A1"/>', 'c')).toEqual(['<c r="A1"/>']);
  });

  it('does not end an element at a closing tag of a longer name', () => {
    expect(spans('<c r="A1"><cx>1</cx ></c>', 'c')).toEqual(['<c r="A1"><cx>1</cx ></c>']);
  });

  it('skips elements written inside comments, character data and instructions', () => {
    expect(
      spans('<!-- <c r="X1"/> --><?pi <c r="X2"/> ?><![CDATA[<c r="X3"></c>]]><c r="A1"/>', 'c'),
    ).toEqual(['<c r="A1"/>']);
  });

  it('does not let an opening inside a comment take the element that follows', () => {
    expect(spans('<!-- legacy <c marker --><c r="A1"><v>1</v></c>', 'c')).toEqual([
      '<c r="A1"><v>1</v></c>',
    ]);
  });

  it('does not end an element at a closing tag inside a comment or character data', () => {
    expect(
      [...markupElements('<f>1<!-- </f> -->+<![CDATA[</f>]]>2</f><f>3</f>', 'f')].map(
        (element) => element.body,
      ),
    ).toEqual(['1<!-- </f> -->+<![CDATA[</f>]]>2', '3']);
  });

  it('reads a closing bracket inside a quoted attribute as part of the tag', () => {
    expect(
      [...markupElements(`<c r="A1" x="a>b" y='/>'><v>1</v></c>`, 'c')].map((element) => ({
        attributes: element.attributes,
        body: element.body,
        selfClosing: element.selfClosing,
      })),
    ).toEqual([{ attributes: ` r="A1" x="a>b" y='/>'`, body: '<v>1</v>', selfClosing: false }]);
  });

  it('stops at an unterminated comment', () => {
    expect(spans('<c r="A1"/><!-- <c r="X1"/>', 'c')).toEqual(['<c r="A1"/>']);
  });
});

describe('replaceMarkupElements', () => {
  it('replaces one element and keeps a neighbour closed with whitespace byte for byte', () => {
    const sheet = '<row r="1"><c r="A1"><v>1</v></c ><c r="B1" s="2"><v>2</v></c ></row>';
    expect(
      replaceMarkupElements(sheet, 'c', (cell) =>
        cell.attributes.includes('A1') ? '<c r="A1"><v>5</v></c>' : undefined,
      ),
    ).toBe('<row r="1"><c r="A1"><v>5</v></c><c r="B1" s="2"><v>2</v></c ></row>');
  });
});

describe('openTags', () => {
  it('skips tags inside comments and reads quoted brackets as part of the tag', () => {
    expect([
      ...openTags('<sheet name="a>b"/><!-- <sheet name="hidden"/> --><sheet\nname="c">', 'sheet'),
    ]).toEqual(['<sheet name="a>b"/>', '<sheet\nname="c">']);
  });

  it('stops when no closing bracket follows an opening', () => {
    expect([...openTags('<sheet name="a"/><sheet <sheet ', 'sheet')]).toEqual([
      '<sheet name="a"/>',
    ]);
  });
});
