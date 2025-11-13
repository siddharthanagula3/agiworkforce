import React, { useState } from 'react';
import { Search, TrendingUp, Users, Copy, Upload } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useMarketplaceStore } from '../../stores/marketplaceStore';
import { WorkflowCard } from './WorkflowCard';

export function MarketplaceHero() {
  const {
    marketplaceStats,
    featuredWorkflows,
    searchWorkflows,
    filters
  } = useMarketplaceStore();

  const [searchInput, setSearchInput] = useState(filters.searchQuery);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchWorkflows(searchInput);
  };

  const handlePublishClick = () => {
    // Scroll to publish tab or trigger tab change
    const publishTab = document.querySelector('[value="publish"]');
    if (publishTab instanceof HTMLElement) {
      publishTab.click();
    }
  };

  return (
    <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-b">
      <div className="container mx-auto px-6 py-12">
        {/* Main Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold tracking-tight mb-4">
            Workflow Marketplace
          </h1>
          <p className="text-xl text-muted-foreground mb-2">
            Clone, Customize, Share - The Future of Work Automation
          </p>
          <p className="text-lg text-muted-foreground">
            Join thousands of creators building the autonomous workplace
          </p>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center justify-center gap-8 mb-8">
          <StatCard
            icon={<Copy className="h-5 w-5" />}
            value={formatNumber(marketplaceStats?.total_clones || 0)}
            label="Workflows Cloned"
          />
          <StatCard
            icon={<Users className="h-5 w-5" />}
            value={formatNumber(marketplaceStats?.total_creators || 0)}
            label="Creators"
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            value={formatNumber(marketplaceStats?.workflows_this_week || 0)}
            label="New This Week"
          />
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="max-w-3xl mx-auto mb-8">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search workflows... (e.g., 'email automation', 'customer support')"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-12 h-14 text-lg"
              />
            </div>
            <Button type="submit" size="lg" className="h-14 px-8">
              Search
            </Button>
          </div>
        </form>

        {/* CTA Buttons */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <Button variant="default" size="lg" onClick={handlePublishClick} className="gap-2">
            <Upload className="h-5 w-5" />
            Publish Your Workflow
          </Button>
        </div>

        {/* Featured Carousel Preview (First 3) */}
        {featuredWorkflows.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Featured Workflows</h2>
              <Button variant="ghost" className="text-sm">
                View All
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredWorkflows.slice(0, 3).map((workflow) => (
                <WorkflowCard key={workflow.id} workflow={workflow} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  value: string;
  label: string;
}

function StatCard({ icon, value, label }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 px-6 py-3 rounded-lg bg-background/50 backdrop-blur">
      <div className="text-primary">{icon}</div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M+`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K+`;
  }
  return num.toString();
}
