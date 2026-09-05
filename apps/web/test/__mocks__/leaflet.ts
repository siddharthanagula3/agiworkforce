import { vi } from 'vitest';

export const MOCK_MAP_WIDTH_PX = 640;
export const MOCK_MAP_HEIGHT_PX = 360;
export const MOCK_MAP_INITIAL_ZOOM = 12;

const DEGREES_TO_PIXELS = 4;

export interface MockLeafletMap {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  setView: ReturnType<typeof vi.fn>;
  setZoom: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
  getZoom: () => number;
  getSize: () => { x: number; y: number };
  latLngToContainerPoint: (latLng: [number, number]) => { x: number; y: number };
}

export const mapInstances: MockLeafletMap[] = [];

function createMockMap(): MockLeafletMap {
  let zoom = MOCK_MAP_INITIAL_ZOOM;
  const map: MockLeafletMap = {
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    setView: vi.fn(),
    setZoom: vi.fn((next: number) => {
      zoom = next;
    }),
    fitBounds: vi.fn(),
    getZoom: () => zoom,
    getSize: () => ({ x: MOCK_MAP_WIDTH_PX, y: MOCK_MAP_HEIGHT_PX }),
    latLngToContainerPoint: ([latitude, longitude]) => ({
      x: MOCK_MAP_WIDTH_PX / 2 + longitude * DEGREES_TO_PIXELS,
      y: MOCK_MAP_HEIGHT_PX / 2 - latitude * DEGREES_TO_PIXELS,
    }),
  };
  mapInstances.push(map);
  return map;
}

export function resetLeafletMock(): void {
  mapInstances.length = 0;
  tileLayers.length = 0;
}

export interface MockTileLayer {
  urlTemplate: string;
  addTo: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

export const tileLayers: MockTileLayer[] = [];

function createMockTileLayer(urlTemplate: string): MockTileLayer {
  const layer: MockTileLayer = { urlTemplate, addTo: vi.fn(), remove: vi.fn() };
  tileLayers.push(layer);
  return layer;
}

const leaflet = {
  map: vi.fn(() => createMockMap()),
  tileLayer: vi.fn((urlTemplate: string) => createMockTileLayer(urlTemplate)),
  latLng: (latitude: number, longitude: number) => [latitude, longitude],
  latLngBounds: (points: unknown[]) => points,
};

export default leaflet;
