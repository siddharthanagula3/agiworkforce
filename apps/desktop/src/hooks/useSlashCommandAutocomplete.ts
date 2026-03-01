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
    command: '/pdf',
    description: 'Generate a PDF document',
    example: '/pdf Monthly Report',
    icon: '📄',
  },
  {
    command: '/word',
    description: 'Generate a Word document',
    example: '/word Meeting Notes',
    icon: '📝',
  },
  {
    command: '/excel',
    description: 'Generate an Excel spreadsheet',
    example: '/excel Sales Data',
    icon: '📊',
  },
];

export function useSlashCommandAutocomplete() {
  /**
   * Get autocomplete suggestions based on current input
   * @param input - The current user input
   * @param selectedIndex - Currently highlighted suggestion index
   * @returns AutocompleteResult with suggestions and visibility state
   */
  const getAutocomplete = (input: string, selectedIndex: number = -1): AutocompleteResult => {
    // Show autocomplete only if input starts with / and has at least 1 character
    const showAutocomplete = input.startsWith('/') && input.length > 1;

    if (!showAutocomplete) {
      return {
        showAutocomplete: false,
        suggestions: [],
        selectedIndex: -1,
      };
    }

    // Extract the command part (after / and before space)
    const commandMatch = input.match(/^\/([a-zA-Z]*)/);
    if (!commandMatch || commandMatch[1] === undefined) {
      return {
        showAutocomplete: false,
        suggestions: [],
        selectedIndex: -1,
      };
    }

    const searchTerm = commandMatch[1].toLowerCase();

    // Filter suggestions based on search term
    const filtered = COMMAND_SUGGESTIONS.filter((cmd) =>
      cmd.command.slice(1).toLowerCase().startsWith(searchTerm),
    );

    // Clamp selectedIndex to valid range
    const validSelectedIndex = Math.max(-1, Math.min(selectedIndex, filtered.length - 1));

    return {
      showAutocomplete: filtered.length > 0,
      suggestions: filtered,
      selectedIndex: validSelectedIndex,
    };
  };

  /**
   * Get the full command text for a suggestion
   * @param suggestion - The command suggestion
   * @param args - Optional arguments to append after command
   * @returns The complete command string
   */
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
