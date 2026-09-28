export const ROUTING_PROFILE_CHOICES = ['auto', 'speed', 'quality', 'cost'] as const;

export type RoutingProfileChoice = (typeof ROUTING_PROFILE_CHOICES)[number];

export interface RoutingProfileChoiceOption {
  choice: RoutingProfileChoice;
  label: string;
  description: string;
}

export const ROUTING_PROFILE_CHOICE_OPTIONS: readonly RoutingProfileChoiceOption[] = [
  {
    choice: 'auto',
    label: 'Auto',
    description: 'Picks the model for each message from the task, your plan and cost.',
  },
  {
    choice: 'speed',
    label: 'Instant',
    description: 'Answers fastest, on the quickest models your plan includes.',
  },
  {
    choice: 'quality',
    label: 'Best',
    description: 'The most capable model your plan includes, for harder work.',
  },
  {
    choice: 'cost',
    label: 'Economy',
    description: 'The lowest-cost model that can handle the task.',
  },
];

export function isRoutingProfileChoice(value: unknown): value is RoutingProfileChoice {
  return (
    typeof value === 'string' && (ROUTING_PROFILE_CHOICES as readonly string[]).includes(value)
  );
}
