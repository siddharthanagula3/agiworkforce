interface GreetingConfig {
  text: string;
}

function getTimePrefix(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Evening';
  return 'Good evening';
}

export function getGreeting(name?: string): GreetingConfig {
  const prefix = getTimePrefix();
  const displayName = name ?? 'there';
  return { text: `${prefix}, ${displayName}` };
}
