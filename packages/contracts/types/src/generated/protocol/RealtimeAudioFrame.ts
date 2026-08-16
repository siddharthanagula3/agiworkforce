
export type RealtimeAudioFrame = {
  data: string;
  sample_rate: number;
  num_channels: number;
  samples_per_channel: number | null;
  item_id: string | null;
};
