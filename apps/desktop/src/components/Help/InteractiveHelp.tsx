import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Search, BookOpen, Video, FileText, MessageCircle, X, ChevronRight } from 'lucide-react';
import { Button } from '../ui/Button';

interface HelpArticle {
  id: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  videoUrl?: string;
  relatedArticles?: string[];
}

interface HelpContext {
  page: string;
  feature?: string;
  action?: string;
}

interface InteractiveHelpProps {
  context?: HelpContext;
  onClose?: () => void;
}

/**
 * InteractiveHelp - Context-sensitive help system
 *
 * Features:
 * - Context-aware help suggestions
 * - Fuzzy search across all help articles
 * - Video tutorials integration
 * - Related articles suggestions
 * - Keyboard shortcuts guide
 * - Quick actions
 */
export const InteractiveHelp = ({ context, onClose }: InteractiveHelpProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [filteredArticles, setFilteredArticles] = useState<HelpArticle[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadArticles();
  }, []);

  useEffect(() => {
    filterArticles();
  }, [searchQuery, articles, context]);

  const loadArticles = async () => {
    setLoading(true);
    try {
      // In a real implementation, load from database or API
      const builtInArticles = getBuiltInArticles();
      setArticles(builtInArticles);
    } catch (error) {
      console.error('Failed to load help articles:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterArticles = useCallback(() => {
    let filtered = articles;

    // Context-aware filtering
    if (context && !searchQuery) {
      filtered = articles.filter(
        (article) =>
          article.category === context.page ||
          (context.feature && article.tags.includes(context.feature)) ||
          (context.action && article.tags.includes(context.action))
      );
    }

    // Search filtering with fuzzy matching
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = articles.filter(
        (article) =>
          article.title.toLowerCase().includes(query) ||
          article.description.toLowerCase().includes(query) ||
          article.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          article.content.toLowerCase().includes(query)
      );
    }

    setFilteredArticles(filtered);
  }, [articles, searchQuery, context]);

  const recordHelpUsage = async (articleId: string, helpful: boolean) => {
    try {
      await invoke('record_help_session', {
        userId: 'current-user',
        context: context?.page || 'unknown',
        query: searchQuery || null,
        helpArticleId: articleId,
        wasHelpful: helpful,
      });
    } catch (error) {
      console.error('Failed to record help usage:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-background rounded-lg shadow-2xl border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <BookOpen className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-2xl font-bold">Help Center</h2>
              {context && (
                <p className="text-sm text-muted-foreground">
                  Context: {context.page}
                  {context.feature && ` › ${context.feature}`}
                </p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Search */}
        <div className="p-6 border-b border-border bg-card">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search for help..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex h-[calc(90vh-200px)]">
          {/* Articles List */}
          <div className="w-1/3 border-r border-border overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="mt-2 text-sm text-muted-foreground">Loading help articles...</p>
              </div>
            ) : filteredArticles.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-muted-foreground">No articles found</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredArticles.map((article) => (
                  <button
                    key={article.id}
                    onClick={() => setSelectedArticle(article)}
                    className={`w-full p-4 text-left transition-colors hover:bg-accent ${
                      selectedArticle?.id === article.id ? 'bg-accent' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {article.videoUrl && (
                            <Video className="h-4 w-4 text-blue-500 flex-shrink-0" />
                          )}
                          <h3 className="font-semibold truncate">{article.title}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {article.description}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {article.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="text-xs px-2 py-0.5 bg-secondary rounded-full text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Article Detail */}
          <div className="flex-1 overflow-y-auto">
            {selectedArticle ? (
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-2">{selectedArticle.title}</h2>
                <p className="text-muted-foreground mb-6">{selectedArticle.description}</p>

                {selectedArticle.videoUrl && (
                  <div className="mb-6 aspect-video bg-secondary rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <Video className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Video tutorial</p>
                      <Button variant="outline" size="sm" className="mt-2">
                        Watch Video
                      </Button>
                    </div>
                  </div>
                )}

                <div className="prose prose-sm max-w-none dark:prose-invert">
                  {selectedArticle.content.split('\n\n').map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>

                {selectedArticle.relatedArticles && selectedArticle.relatedArticles.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-border">
                    <h3 className="text-lg font-semibold mb-4">Related Articles</h3>
                    <div className="space-y-2">
                      {selectedArticle.relatedArticles.map((relatedId) => {
                        const related = articles.find((a) => a.id === relatedId);
                        if (!related) return null;
                        return (
                          <button
                            key={relatedId}
                            onClick={() => setSelectedArticle(related)}
                            className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent transition-colors"
                          >
                            <span className="font-medium">{related.title}</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Feedback */}
                <div className="mt-8 pt-6 border-t border-border">
                  <p className="text-sm font-medium mb-3">Was this helpful?</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => recordHelpUsage(selectedArticle.id, true)}
                    >
                      Yes
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => recordHelpUsage(selectedArticle.id, false)}
                    >
                      No
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center p-6">
                <div>
                  <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Select an article</h3>
                  <p className="text-sm text-muted-foreground">
                    Choose a help article from the list to view its contents
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions Footer */}
        <div className="p-4 border-t border-border bg-card">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button variant="ghost" size="sm">
                <MessageCircle className="h-4 w-4 mr-2" />
                Contact Support
              </Button>
              <Button variant="ghost" size="sm">
                <BookOpen className="h-4 w-4 mr-2" />
                View Documentation
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              Press <kbd className="px-2 py-1 bg-secondary rounded">Ctrl+/</kbd> for shortcuts
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Built-in help articles (in a real app, these would come from a database/API)
function getBuiltInArticles(): HelpArticle[] {
  return [
    {
      id: 'getting-started',
      title: 'Getting Started with AGI Workforce',
      description: 'Learn the basics of creating and executing automation goals',
      category: 'getting-started',
      tags: ['beginner', 'basics', 'tutorial'],
      content:
        'AGI Workforce is an AI-powered desktop automation platform. To get started, simply describe what you want to automate in the goal input field. The AI will plan the necessary steps and execute them for you.\n\nYou can create goals like "Organize my desktop files" or "Summarize my unread emails". The more specific you are, the better the results.',
      videoUrl: 'https://example.com/getting-started',
      relatedArticles: ['goals', 'workflows'],
    },
    {
      id: 'goals',
      title: 'Understanding Goals',
      description: 'Learn how to create effective automation goals',
      category: 'automation',
      tags: ['goals', 'automation', 'planning'],
      content:
        'Goals are high-level tasks you want the AI to accomplish. When you create a goal, the AI analyzes it and breaks it down into executable steps.\n\nTips for creating good goals:\n- Be specific about what you want to achieve\n- Mention input and output locations\n- Specify success criteria when relevant\n- Break complex tasks into smaller goals',
      relatedArticles: ['getting-started', 'workflows'],
    },
    {
      id: 'workflows',
      title: 'Creating Workflows',
      description: 'Build complex multi-step automations with the workflow builder',
      category: 'workflows',
      tags: ['workflows', 'builder', 'advanced'],
      content:
        'Workflows let you create complex automations with conditional logic and parallel execution. Use the visual workflow builder to drag and drop nodes and connect them.\n\nAvailable node types:\n- Trigger nodes (manual, scheduled, event-driven)\n- Action nodes (file operations, API calls, database queries)\n- Decision nodes (if/else logic)\n- Loop nodes (iterate over collections)',
      videoUrl: 'https://example.com/workflows',
      relatedArticles: ['getting-started', 'templates'],
    },
    {
      id: 'templates',
      title: 'Using Agent Templates',
      description: 'Quick-start with pre-built agent templates',
      category: 'templates',
      tags: ['templates', 'marketplace', 'productivity'],
      content:
        'Agent templates are pre-configured workflows for common tasks. Browse the marketplace to find templates for invoice processing, email automation, web scraping, and more.\n\nYou can install templates and customize them to fit your specific needs. Templates can be shared with team members.',
      relatedArticles: ['workflows', 'teams'],
    },
    {
      id: 'teams',
      title: 'Team Collaboration',
      description: 'Share workflows and collaborate with team members',
      category: 'teams',
      tags: ['teams', 'collaboration', 'sharing'],
      content:
        'Create teams to share workflows, templates, and knowledge bases with colleagues. Team members can have different roles:\n- Viewer: Can view and execute workflows\n- Editor: Can modify workflows\n- Admin: Full access including member management',
      relatedArticles: ['templates', 'workflows'],
    },
    {
      id: 'shortcuts',
      title: 'Keyboard Shortcuts',
      description: 'Master AGI Workforce with keyboard shortcuts',
      category: 'tips',
      tags: ['shortcuts', 'productivity', 'keyboard'],
      content:
        'Keyboard shortcuts:\n- Ctrl+K: Open command palette\n- Ctrl+N: New conversation\n- Ctrl+Shift+L: Toggle theme\n- Ctrl+/: Show all shortcuts\n- Ctrl+,: Open settings\n- Escape: Close dialogs',
      relatedArticles: ['getting-started'],
    },
  ];
}
