import { z } from 'zod';

export const MAP_CONFIG_PATH = '/api/maps/config';

export const MapTileConfigSchema = z.object({
  tileUrlTemplate: z.string(),
  attribution: z.string(),
  darkTileUrlTemplate: z.string(),
  darkAttribution: z.string(),
  dimLightTiles: z.boolean(),
  minZoom: z.number(),
  maxZoom: z.number(),
});
export type MapTileConfig = z.infer<typeof MapTileConfigSchema>;

export function parseMapTileConfig(value: unknown): MapTileConfig | null {
  const parsed = MapTileConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
