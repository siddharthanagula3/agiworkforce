interface GreetingConfig {
  text: string;
  emoji?: string;
}

const morningGreetings: GreetingConfig[] = [
  { text: 'Good morning, {name}' },
  { text: 'Ready to build?' },
  { text: "What's on the agenda?" },
];

const afternoonGreetings: GreetingConfig[] = [
  { text: 'Good afternoon, {name}' },
  { text: 'What are we tackling?' },
  { text: "Let's get things done" },
];

const eveningGreetings: GreetingConfig[] = [
  { text: 'Good evening, {name}' },
  { text: "What's on your mind?" },
  { text: 'Evening plans?' },
];

const nightGreetings: GreetingConfig[] = [
  { text: 'Working late, {name}?', emoji: '🌙' },
  { text: 'Moonlit chat?', emoji: '🌙' },
  { text: 'Night owl mode', emoji: '🦉' },
];

function getTimeGreetings(): GreetingConfig[] {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return morningGreetings;
  if (hour >= 12 && hour < 17) return afternoonGreetings;
  if (hour >= 17 && hour < 21) return eveningGreetings;
  return nightGreetings;
}

export function getGreeting(name?: string): GreetingConfig {
  const greetings = getTimeGreetings();
  const greeting = greetings[Math.floor(Math.random() * greetings.length)]!;
  const text = name
    ? greeting.text.replace('{name}', name)
    : greeting.text.replace(', {name}', '').replace('{name}', '');
  return { ...greeting, text };
}
