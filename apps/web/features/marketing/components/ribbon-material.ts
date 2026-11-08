import { agiRibbonMotion, symbolShinePoint } from '@agiworkforce/design-tokens';

type Point = { x: number; y: number };
type Section = Point & {
  nx: number;
  ny: number;
  left: number;
  right: number;
  angle: number;
  radius: number;
};

function surface(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Ribbon material preparation is unavailable');
  return { canvas, context };
}

export function createRibbonMaterial(image: HTMLImageElement) {
  const {
    textureSize,
    pathSamples,
    pathOversampling,
    stripWidth,
    flowMapSize,
    crossSectionRadius,
  } = agiRibbonMotion;
  const source = surface(textureSize, textureSize);
  source.context.drawImage(image, 0, 0, textureSize, textureSize);
  const pixels = source.context.getImageData(0, 0, textureSize, textureSize).data;
  const queue = new Int32Array(textureSize * textureSize);
  const visited = new Uint8Array(queue.length);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < queue.length; index += 1) {
    if (
      pixels[index * 4 + 3]! > 127 &&
      Math.max(pixels[index * 4]!, pixels[index * 4 + 1]!, pixels[index * 4 + 2]!) >
        agiRibbonMotion.minimumMaterialValue
    ) {
      visited[index] = 1;
      queue[tail++] = index;
    }
  }
  while (head < tail) {
    const index = queue[head++]!;
    const column = index % textureSize;
    const neighbors = [
      column > 0 ? index - 1 : -1,
      column + 1 < textureSize ? index + 1 : -1,
      index - textureSize,
      index + textureSize,
    ];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || neighbor >= queue.length || visited[neighbor]) continue;
      visited[neighbor] = 1;
      pixels[neighbor * 4] = pixels[index * 4]!;
      pixels[neighbor * 4 + 1] = pixels[index * 4 + 1]!;
      pixels[neighbor * 4 + 2] = pixels[index * 4 + 2]!;
      queue[tail++] = neighbor;
    }
  }
  const pixel = (x: number, y: number) => {
    const column = Math.max(0, Math.min(textureSize - 1, Math.round(x * textureSize)));
    const row = Math.max(0, Math.min(textureSize - 1, Math.round(y * textureSize)));
    return (row * textureSize + column) * 4;
  };
  const opaque = (x: number, y: number) => pixels[pixel(x, y) + 3]! > 127;
  const raw: Array<Point & { distance: number }> = [];
  let distance = 0;
  const count = pathSamples * pathOversampling;
  for (let index = 0; index <= count; index += 1) {
    const point = symbolShinePoint(index / count);
    const x = point.x / 100;
    const y = point.y / 100;
    const previous = raw[index - 1];
    if (previous) distance += Math.hypot(x - previous.x, y - previous.y);
    raw.push({ x, y, distance });
  }
  const centers: Point[] = [];
  let segment = 0;
  for (let index = 0; index < pathSamples; index += 1) {
    const target = (index / pathSamples) * distance;
    while (raw[segment + 1]!.distance < target) segment += 1;
    const start = raw[segment]!;
    const end = raw[segment + 1]!;
    const fraction = (target - start.distance) / (end.distance - start.distance);
    centers.push({
      x: start.x + (end.x - start.x) * fraction,
      y: start.y + (end.y - start.y) * fraction,
    });
  }
  const step = 1 / textureSize;
  const [centerX, centerY] = agiRibbonMotion.center;
  let previousAngle = -Infinity;
  const sections: Section[] = centers.map((point) => {
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    const radius = Math.hypot(dx, dy);
    const nx = dx / radius;
    const ny = dy / radius;
    let angle = Math.atan2(dy, dx);
    while (angle < previousAngle) angle += Math.PI * 2;
    previousAngle = angle;
    const filled = (offset: number) => opaque(point.x + nx * offset, point.y + ny * offset);
    let middle = 0;
    if (!filled(middle)) {
      let found = false;
      for (let offset = step; offset <= crossSectionRadius && !found; offset += step) {
        if (filled(offset)) {
          middle = offset;
          found = true;
        } else if (filled(-offset)) {
          middle = -offset;
          found = true;
        }
      }
      if (!found) throw new Error('The ribbon path leaves the original material');
    }
    let left = middle;
    let right = middle;
    while (left > -crossSectionRadius && filled(left - step)) left -= step;
    while (right < crossSectionRadius && filled(right + step)) right += step;
    left = Math.min(middle, left + step);
    right = Math.max(middle + step, right - step);
    return { ...point, nx, ny, left, right, angle, radius };
  });

  const strip = surface(pathSamples, stripWidth);
  const stripPixels = strip.context.createImageData(pathSamples, stripWidth);
  for (let index = 0; index < pathSamples; index += 1) {
    const section = sections[index]!;
    for (let across = 0; across < stripWidth; across += 1) {
      const offset = section.left + (across / (stripWidth - 1)) * (section.right - section.left);
      const original = pixel(section.x + section.nx * offset, section.y + section.ny * offset);
      const destination = (across * pathSamples + index) * 4;
      stripPixels.data[destination] = pixels[original]!;
      stripPixels.data[destination + 1] = pixels[original + 1]!;
      stripPixels.data[destination + 2] = pixels[original + 2]!;
      stripPixels.data[destination + 3] = 255;
    }
  }
  const smoothed = strip.context.createImageData(pathSamples, stripWidth);
  const smoothing = agiRibbonMotion.materialSmoothing;
  for (let row = 0; row < stripWidth; row += 1) {
    for (let column = 0; column < pathSamples; column += 1) {
      const destination = (row * pathSamples + column) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        let total = 0;
        let weight = 0;
        for (let offset = -smoothing; offset <= smoothing; offset += 1) {
          const amount = smoothing + 1 - Math.abs(offset);
          const sourceColumn = (column + offset + pathSamples) % pathSamples;
          total += stripPixels.data[(row * pathSamples + sourceColumn) * 4 + channel]! * amount;
          weight += amount;
        }
        smoothed.data[destination + channel] = Math.round(total / weight);
      }
      smoothed.data[destination + 3] = 255;
    }
  }
  strip.context.putImageData(smoothed, 0, 0);

  const map = surface(flowMapSize, flowMapSize);
  const mapPixels = map.context.createImageData(flowMapSize, flowMapSize);
  for (let row = 0; row < flowMapSize; row += 1) {
    for (let column = 0; column < flowMapSize; column += 1) {
      const x = (column + 0.5) / flowMapSize;
      const y = (row + 0.5) / flowMapSize;
      let angle = Math.atan2(y - centerY, x - centerX);
      while (angle < sections[0]!.angle) angle += Math.PI * 2;
      let low = 0;
      let high: number = pathSamples;
      while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if (sections[middle]!.angle <= angle) low = middle;
        else high = middle;
      }
      const start = sections[low]!;
      const end = sections[(low + 1) % pathSamples]!;
      const endAngle = low + 1 === pathSamples ? end.angle + Math.PI * 2 : end.angle;
      const fraction = Math.max(0, Math.min(1, (angle - start.angle) / (endAngle - start.angle)));
      const along = (low + fraction) / pathSamples;
      const left = start.left + (end.left - start.left) * fraction;
      const right = start.right + (end.right - start.right) * fraction;
      const radius = start.radius + (end.radius - start.radius) * fraction;
      const across = Math.max(
        0,
        Math.min(1, (Math.hypot(x - centerX, y - centerY) - radius - left) / (right - left)),
      );
      const destination = (row * flowMapSize + column) * 4;
      mapPixels.data[destination] = Math.round((Math.cos(along * Math.PI * 2) * 0.5 + 0.5) * 255);
      mapPixels.data[destination + 1] = Math.round(
        (Math.sin(along * Math.PI * 2) * 0.5 + 0.5) * 255,
      );
      mapPixels.data[destination + 2] = Math.round(across * 255);
      mapPixels.data[destination + 3] = 255;
    }
  }
  map.context.putImageData(mapPixels, 0, 0);
  return { strip: strip.canvas, map: map.canvas };
}
