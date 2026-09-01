const ORIGIN_RECT = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  toJSON: () => ({}),
} as DOMRect;

const EMPTY_RECT_LIST = Object.assign([] as DOMRect[], {
  item: () => null,
}) as unknown as DOMRectList;

if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => EMPTY_RECT_LIST;
  Range.prototype.getBoundingClientRect = () => ORIGIN_RECT;
}
