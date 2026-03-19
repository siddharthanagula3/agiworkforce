const PLATFORM_PROMPTS: Record<string, string> = {
  'slack.com': `You are assisting on Slack. Key navigation:
- Cmd/Ctrl+K: Quick Switcher (search channels/DMs)
- Cmd/Ctrl+Shift+K: Browse DMs
- Messages are in .c-message containers, channel list in .p-channel_sidebar
- Use /remind, /status, /mute slash commands
- Thread replies are in .c-virtual_list__item inside .p-flexpane
- Reactions via hover toolbar, emoji picker via +emoji button`,

  'mail.google.com': `You are assisting on Gmail. Key patterns:
- Compose: Cmd/Ctrl+Shift+C (new window) or C (inline)
- Search: / or click search bar. Operators: from:, to:, subject:, has:attachment, is:unread
- Navigation: J/K for next/prev, X to select, E to archive, # to delete
- Email rows are in .zA containers, compose in .T-I.J-J5-Ji
- Labels in left sidebar .aim elements
- Settings gear icon top-right, then "See all settings"`,

  'calendar.google.com': `You are assisting on Google Calendar. Key patterns:
- Quick create: click any time slot or press C
- Navigation: T for today, J/K for back/forward
- Views: D (day), W (week), M (month), Y (year), A (agenda)
- Events are .WOTBif or [data-eventid] elements
- Side panel for event details, mini calendar in left sidebar
- Settings via gear icon top-right`,

  'docs.google.com': `You are assisting on Google Docs. Key patterns:
- Cmd/Ctrl+/ : Keyboard shortcuts list
- Cmd/Ctrl+Shift+S: Toggle suggestion mode
- Cmd/Ctrl+Alt+M: Insert comment
- Document content in .kix-appview-editor, toolbar in .docs-toolbar
- Suggestions in .docos-anchoreddocoview
- Share button top-right for permissions`,

  'github.com': `You are assisting on GitHub. Key patterns:
- Press . to open github.dev web editor on any repo
- T for file finder, S or / for search
- Issues: labels, milestones, assignees in sidebar. Markdown supported.
- PRs: Files changed tab for diff, Conversations for comments
- Code navigation: click symbols for references
- Actions tab for CI/CD workflows
- Notifications bell top-right, Cmd/Ctrl+K for command palette`,

  'notion.so': `You are assisting on Notion. Key patterns:
- Cmd/Ctrl+K: Quick search
- Cmd/Ctrl+N: New page
- / for slash command menu (headings, lists, toggles, databases, embeds)
- Blocks are .notion-selectable elements
- Sidebar navigation on left, page tree collapsible
- Drag handle appears on hover left of any block
- @ for mentions, [[ for page links
- Cmd/Ctrl+Shift+L: Toggle dark mode`,

  'linear.app': `You are assisting on Linear. Key patterns:
- C: Create new issue
- Cmd/Ctrl+K: Command palette
- Issues in list/board views, .issue-row or similar containers
- Status: Backlog → Todo → In Progress → Done → Canceled
- Filters: assignee, label, priority, status in toolbar
- Cycles for sprints, Projects for grouping
- Keyboard-first: G then I for my issues, G then V for views`,

  'figma.com': `You are assisting on Figma. Key patterns:
- V: Move tool, F: Frame, R: Rectangle, T: Text, P: Pen
- Cmd/Ctrl+D: Duplicate selection
- Cmd/Ctrl+G: Group, Cmd/Ctrl+Shift+G: Ungroup
- Layers panel on left, properties on right
- Auto Layout: Shift+A on selected frame
- Components: Cmd/Ctrl+Alt+K to create
- Canvas is .fig-canvas, layers in .objects_panel
- Zoom: Cmd/Ctrl+scroll, Shift+1 to fit all`,
};

export function getPlatformPrompt(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    for (const [domain, prompt] of Object.entries(PLATFORM_PROMPTS)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return prompt;
      }
    }
  } catch {
    // Invalid URL — no prompt
  }
  return null;
}
