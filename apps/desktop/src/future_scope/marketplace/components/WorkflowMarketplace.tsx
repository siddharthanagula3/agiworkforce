import React, { useEffect, useState } from 'react';
import { invoke } from '../../../lib/tauri-mock';
import { PublishedWorkflow } from '../../../types/marketplace';

interface WorkflowTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  estimated_time_saved: number;
  estimated_cost_saved: number;
  difficulty: string;
  setup_instructions: string;
  sample_results: string;
  success_stories: string[];
}

export const WorkflowMarketplace: React.FC = () => {
  const [featuredWorkflows, setFeaturedWorkflows] = useState<PublishedWorkflow[]>([]);
  const [trendingWorkflows, setTrendingWorkflows] = useState<PublishedWorkflow[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMarketplaceData();
  }, []);

  const loadMarketplaceData = async () => {
    try {
      setLoading(true);

      // Load featured workflows
      const featured = await invoke<PublishedWorkflow[]>('get_featured_workflows', { limit: 6 });
      setFeaturedWorkflows(featured);

      // Load trending workflows
      const trending = await invoke<PublishedWorkflow[]>('get_trending_workflows', { limit: 6 });
      setTrendingWorkflows(trending);

      // Load workflow templates
      const templatesData = await invoke<WorkflowTemplate[]>('get_workflow_templates');
      setTemplates(templatesData);

      // Load category counts
      const counts = await invoke<[string, number][]>('get_category_counts');
      const countsMap: Record<string, number> = {};
      counts.forEach(([category, count]) => {
        countsMap[category] = count;
      });
      setCategoryCounts(countsMap);

      setLoading(false);
    } catch (error) {
      console.error('Failed to load marketplace data:', error);
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      const results = await invoke<PublishedWorkflow[]>('search_marketplace_workflows', {
        searchQuery: searchQuery,
        category: selectedCategory,
        minRating: null,
        tags: [],
        verifiedOnly: false,
        sortBy: 'most_cloned',
        limit: 50,
        offset: 0,
      });
      // Handle search results (update state, show results, etc.)
      console.log('Search results:', results);
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  const handleCloneWorkflow = async (workflowId: string) => {
    try {
      const userId = 'current_user_id'; // Get from auth context
      const userName = 'Current User'; // Get from auth context

      const clonedId = await invoke<string>('clone_marketplace_workflow', {
        workflowId,
        userId,
        userName,
      });

      alert(`Workflow cloned successfully! New workflow ID: ${clonedId}`);
      // Navigate to the cloned workflow or refresh the page
    } catch (error) {
      console.error('Failed to clone workflow:', error);
      alert('Failed to clone workflow');
    }
  };

  const handleRateWorkflow = async (workflowId: string, rating: number) => {
    try {
      const userId = 'current_user_id'; // Get from auth context

      await invoke('rate_workflow', {
        workflowId,
        userId,
        rating,
        comment: null,
      });

      alert('Rating submitted successfully!');
      // Refresh workflow data
    } catch (error) {
      console.error('Failed to rate workflow:', error);
    }
  };

  const handleShareWorkflow = async (workflowId: string, platform: string) => {
    try {
      const shareUrl = await invoke<string>('share_workflow', {
        workflowId,
        platform,
      });

      if (platform === 'direct_link') {
        // Copy to clipboard
        navigator.clipboard.writeText(shareUrl);
        alert('Link copied to clipboard!');
      } else {
        // Open in new window
        window.open(shareUrl, '_blank');
      }
    } catch (error) {
      console.error('Failed to generate share link:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Loading marketplace...</div>
      </div>
    );
  }

  return (
    <div className="workflow-marketplace min-h-screen bg-gray-50 p-8">
      {/* Header */}
      <header className="mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Workflow Marketplace</h1>
        <p className="text-xl text-gray-600 mb-6">
          Clone and customize workflows shared by the community
        </p>

        {/* Search Bar */}
        <div className="flex gap-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search workflows..."
            className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSearch}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Search
          </button>
        </div>
      </header>

      {/* Featured Section */}
      <section className="mb-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">Featured Workflows</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredWorkflows.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              onClone={handleCloneWorkflow}
              onRate={handleRateWorkflow}
              onShare={handleShareWorkflow}
            />
          ))}
        </div>
      </section>

      {/* Trending Section */}
      <section className="mb-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">Trending This Week</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {trendingWorkflows.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              onClone={handleCloneWorkflow}
              onRate={handleRateWorkflow}
              onShare={handleShareWorkflow}
            />
          ))}
        </div>
      </section>

      {/* Category Navigation */}
      <section className="mb-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">Browse by Category</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Object.entries(categoryCounts).map(([category, count]) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`p-6 rounded-lg border-2 transition ${
                selectedCategory === category
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-400'
              }`}
            >
              <div className="text-lg font-semibold capitalize">{category.replace('_', ' ')}</div>
              <div className="text-sm text-gray-600">{count} workflows</div>
            </button>
          ))}
        </div>
      </section>

      {/* Templates Section */}
      <section>
        <h2 className="text-3xl font-bold text-gray-900 mb-6">Pre-built Templates</h2>
        <p className="text-gray-600 mb-6">
          Start with a professional template and customize it to your needs
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {templates.slice(0, 8).map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      </section>
    </div>
  );
};

// Workflow Card Component
interface WorkflowCardProps {
  workflow: PublishedWorkflow;
  onClone: (id: string) => void;
  onRate: (id: string, rating: number) => void;
  onShare: (id: string, platform: string) => void;
}

const WorkflowCard: React.FC<WorkflowCardProps> = ({ workflow, onClone, onShare }) => {
  const [showShareMenu, setShowShareMenu] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition">
      {workflow.thumbnail_url && (
        <img
          src={workflow.thumbnail_url}
          alt={workflow.title}
          className="w-full h-48 object-cover"
        />
      )}

      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-xl font-bold text-gray-900 flex-1">{workflow.title}</h3>
          {workflow.is_verified && (
            <span className="ml-2 text-blue-600" title="Verified">
              ✓
            </span>
          )}
        </div>

        <p className="text-gray-600 mb-4 line-clamp-2">{workflow.description}</p>

        {/* Creator Badge */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-gray-300"></div>
          <span className="text-sm text-gray-700">{workflow.creator_name}</span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mb-4 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <span>📋</span>
            <span>{workflow.clone_count} clones</span>
          </div>
          <div className="flex items-center gap-1">
            <span>⭐</span>
            <span>
              {workflow.rating.toFixed(1)} ({workflow.rating_count})
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span>⏱️</span>
            <span>{workflow.estimated_time_saved}min saved</span>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-4">
          {workflow.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
              {tag}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onClone(workflow.id)}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            Clone & Customize
          </button>
          <button
            onClick={() => setShowShareMenu(!showShareMenu)}
            className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition"
          >
            Share
          </button>
        </div>

        {/* Share Menu */}
        {showShareMenu && (
          <div className="mt-2 p-2 bg-gray-50 rounded">
            <button
              onClick={() => onShare(workflow.id, 'twitter')}
              className="block w-full text-left px-2 py-1 hover:bg-gray-100 rounded"
            >
              Share on Twitter
            </button>
            <button
              onClick={() => onShare(workflow.id, 'linkedin')}
              className="block w-full text-left px-2 py-1 hover:bg-gray-100 rounded"
            >
              Share on LinkedIn
            </button>
            <button
              onClick={() => onShare(workflow.id, 'direct_link')}
              className="block w-full text-left px-2 py-1 hover:bg-gray-100 rounded"
            >
              Copy Link
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Template Card Component
interface TemplateCardProps {
  template: WorkflowTemplate;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template }) => {
  return (
    <div className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition">
      <h4 className="font-bold text-gray-900 mb-2">{template.title}</h4>
      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{template.description}</p>
      <div className="text-xs text-gray-500 mb-3">
        <div>⏱️ {template.estimated_time_saved}min saved</div>
        <div>💰 ${template.estimated_cost_saved.toFixed(0)} saved</div>
      </div>
      <button className="w-full px-3 py-2 bg-gray-100 text-gray-900 rounded hover:bg-gray-200 transition text-sm">
        Use Template
      </button>
    </div>
  );
};

export default WorkflowMarketplace;
