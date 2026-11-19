export type ClassifiedTask =
  | 'computer_use'
  | 'image_generation'
  | 'video_generation'
  | 'deep_research'
  | 'search'
  | 'coding'
  | 'reasoning'
  | 'vision'
  | 'long_context'
  | 'creative_writing'
  | 'simple_chat'
  | 'general';

export const TASK_LABEL: Record<ClassifiedTask, string> = {
  computer_use: 'computer use',
  image_generation: 'image gen',
  video_generation: 'video gen',
  deep_research: 'deep research',
  search: 'web search',
  coding: 'coding',
  reasoning: 'reasoning',
  vision: 'vision',
  long_context: 'long doc',
  creative_writing: 'creative',
  simple_chat: 'chat',
  general: 'general',
};
