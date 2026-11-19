import {
  buildPersonalSourceRows,
  usePersonalSourceData,
  usePersonalSourcesEnabled,
} from '@/src/features/customize/PersonalSourceRows';

export interface WorkIntroSources {
  offered: boolean;
  needsConnect: boolean;
}

const UNKNOWN: WorkIntroSources = { offered: false, needsConnect: false };

export function useWorkIntroSources(): WorkIntroSources {
  const { data, failed } = usePersonalSourceData(usePersonalSourcesEnabled());
  if (!data || failed) return UNKNOWN;

  const connectorOptions = buildPersonalSourceRows(data)
    .map((row) => row.options.filter((option) => option.kind === 'connector'))
    .filter((options) => options.length > 0);
  return {
    offered: connectorOptions.length > 0,
    needsConnect: connectorOptions.some(
      (options) => !options.some((option) => option.state === 'connected'),
    ),
  };
}
