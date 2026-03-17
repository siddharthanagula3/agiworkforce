/**
 * useSlashCommandAutocomplete Hook
 *
 * Provides autocomplete suggestions and filtering for slash commands
 * in the chat input.
 */

export interface CommandSuggestion {
  command: string;
  description: string;
  example: string;
  icon: string;
}

export interface AutocompleteResult {
  showAutocomplete: boolean;
  suggestions: CommandSuggestion[];
  selectedIndex: number;
}

const COMMAND_SUGGESTIONS: CommandSuggestion[] = [
  {
    command: '/browser',
    description: 'Automate browser actions and capture screenshots',
    example: '/browser https://google.com',
    icon: '🌐',
  },
  {
    command: '/terminal',
    description: 'Execute shell commands',
    example: '/terminal ls -la',
    icon: '⌨️',
  },
  {
    command: '/code',
    description: 'Open and edit code files',
    example: '/code src/main.ts',
    icon: '💻',
  },
  {
    command: '/database',
    description: 'Run database queries',
    example: '/database SELECT * FROM users',
    icon: '🗄️',
  },
  {
    command: '/undo',
    description: 'Undo recent AI actions (file changes, etc.)',
    example: '/undo or /undo list',
    icon: '↩️',
  },
  {
    command: '/compact',
    description: 'Compact conversation context to save tokens',
    example: '/compact or /compact code',
    icon: '📦',
  },
  {
    command: '/imagine',
    description: 'Generate an image from a text prompt',
    example: '/imagine a sunset over the mountains',
    icon: '🎨',
  },
  {
    command: '/swarm',
    description: 'Launch a multi-agent swarm to accomplish a goal',
    example: '/swarm research and summarize AI trends',
    icon: '🐝',
  },
  {
    command: '/vision',
    description: 'Analyze screen or image with AI vision',
    example: '/vision analyze',
    icon: '👁️',
  },
  {
    command: '/skills',
    description: 'List or invoke AI employee skills',
    example: '/skills or /skills web-developer',
    icon: '🧠',
  },
  {
    command: '/memory',
    description: 'View, search, or save project memory',
    example: '/memory search auth patterns',
    icon: '💾',
  },
  {
    command: '/recall',
    description: 'Search and inject memory context',
    example: '/recall database schema',
    icon: '🔍',
  },
  {
    command: '/agents',
    description: 'Manage background agents',
    example: '/agents or /agents push review code',
    icon: '🤖',
  },
  {
    command: '/git',
    description: 'Git operations (status, diff, commit, PR)',
    example: '/git status or /git diff',
    icon: '📋',
  },
  {
    command: '/schedule',
    description: 'Schedule tasks and view upcoming jobs',
    example: '/schedule or /schedule daily backup',
    icon: '📅',
  },
  {
    command: '/voice',
    description: 'Voice input and text-to-speech',
    example: '/voice or /voice tts Hello world',
    icon: '🎤',
  },
  {
    command: '/think',
    description: 'Toggle extended thinking mode',
    example: '/think or /think budget 10000',
    icon: '🤔',
  },
  {
    command: '/docs',
    description: 'Generate documents (PDF, Word, Excel)',
    example: '/docs report on Q4 metrics',
    icon: '📄',
  },
  {
    command: '/record',
    description: 'Record and replay desktop automation',
    example: '/record or /record stop',
    icon: '⏺️',
  },
  {
    command: '/metrics',
    description: 'View usage metrics and analytics',
    example: '/metrics',
    icon: '📊',
  },
  {
    command: '/marketplace',
    description: 'Browse and install workflow templates',
    example: '/marketplace or /marketplace install <id>',
    icon: '🏪',
  },
  {
    command: '/desktop',
    description: 'Open computer use / desktop automation',
    example: '/desktop',
    icon: '🖥️',
  },
  {
    command: '/ocr',
    description: 'Extract text from screen or images',
    example: '/ocr',
    icon: '📝',
  },
  {
    command: '/notify',
    description: 'Manage notifications',
    example: '/notify or /notify clear',
    icon: '🔔',
  },
  {
    command: '/lsp',
    description: 'Language server: symbols, diagnostics, definitions',
    example: '/lsp symbols handleClick',
    icon: '🔗',
  },
  {
    command: '/enhance',
    description: 'Enhance the last prompt with AI',
    example: '/enhance',
    icon: '✨',
  },
  {
    command: '/migrate',
    description: 'Import projects from other platforms',
    example: '/migrate',
    icon: '📥',
  },
  {
    command: '/message',
    description: 'Send messages via integrated platforms',
    example: '/message slack #general Hello',
    icon: '💬',
  },
  {
    command: '/settings',
    description: 'Apply settings inline',
    example: '/settings theme dark',
    icon: '⚙️',
  },
  {
    command: '/plan',
    description: 'Generate an interactive execution plan for a task',
    example: '/plan deploy the new feature to staging',
    icon: '📋',
  },
];

export function useSlashCommandAutocomplete() {
  const getAutocomplete = (input: string, selectedIndex: number = -1): AutocompleteResult => {
    const showAutocomplete = input.startsWith('/') && input.length > 1;

    if (!showAutocomplete) {
      return {
        showAutocomplete: false,
        suggestions: [],
        selectedIndex: -1,
      };
    }

    const commandMatch = input.match(/^\/([a-zA-Z]*)/);
    if (!commandMatch || commandMatch[1] === undefined) {
      return {
        showAutocomplete: false,
        suggestions: [],
        selectedIndex: -1,
      };
    }

    const searchTerm = commandMatch[1].toLowerCase();

    const filtered = COMMAND_SUGGESTIONS.filter((cmd) =>
      cmd.command.slice(1).toLowerCase().startsWith(searchTerm),
    );

    const validSelectedIndex = Math.max(-1, Math.min(selectedIndex, filtered.length - 1));

    return {
      showAutocomplete: filtered.length > 0,
      suggestions: filtered,
      selectedIndex: validSelectedIndex,
    };
  };

  const getSuggestionText = (suggestion: CommandSuggestion, args: string = ''): string => {
    if (args) {
      return `${suggestion.command} ${args}`;
    }
    return suggestion.command;
  };

  return {
    getAutocomplete,
    getSuggestionText,
    allSuggestions: COMMAND_SUGGESTIONS,
  };
}
