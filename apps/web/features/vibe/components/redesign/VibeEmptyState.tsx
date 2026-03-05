/**
 * VibeEmptyState - bolt.new-inspired empty state
 *
 * Clean, focused design with:
 * - Large centered "What do you want to build?" heading
 * - 6 template starter cards in a responsive grid
 * - Each card has icon, title, description, and pre-filled prompt
 * - Minimal chrome, dark-theme friendly
 */

import React from 'react';
import {
  User,
  ShoppingCart,
  LayoutDashboard,
  Rocket,
  Server,
  Smartphone,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';

interface VibeEmptyStateProps {
  onPromptSelect: (prompt: string) => void;
}

interface TemplateCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  prompt: string;
  accent: string;
  accentBg: string;
}

const templates: TemplateCard[] = [
  {
    id: 'portfolio',
    title: 'Portfolio Website',
    description: 'Showcase your work with a stunning personal site',
    icon: <User className="h-5 w-5" />,
    prompt:
      'Build a modern portfolio website with dark theme, responsive design, project gallery, about section, and contact form using React and Tailwind CSS',
    accent: 'text-sky-400',
    accentBg: 'bg-sky-500/10 border-sky-500/20',
  },
  {
    id: 'ecommerce',
    title: 'E-Commerce Store',
    description: 'Product listings, cart, and checkout flow',
    icon: <ShoppingCart className="h-5 w-5" />,
    prompt:
      'Build a modern e-commerce store with product grid, search and filters, shopping cart, checkout page, and responsive design using React and Tailwind CSS',
    accent: 'text-emerald-400',
    accentBg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    id: 'dashboard',
    title: 'Dashboard App',
    description: 'Analytics and data visualization interface',
    icon: <LayoutDashboard className="h-5 w-5" />,
    prompt:
      'Build an analytics dashboard app with sidebar navigation, stat cards, interactive charts, data tables, and dark mode using React, Tailwind CSS, and Recharts',
    accent: 'text-violet-400',
    accentBg: 'bg-violet-500/10 border-violet-500/20',
  },
  {
    id: 'landing',
    title: 'Landing Page',
    description: 'High-converting page with hero, features, and CTA',
    icon: <Rocket className="h-5 w-5" />,
    prompt:
      'Build a high-converting landing page with hero section, feature grid, testimonials, pricing table, FAQ accordion, and email signup CTA using React and Tailwind CSS',
    accent: 'text-amber-400',
    accentBg: 'bg-amber-500/10 border-amber-500/20',
  },
  {
    id: 'api-backend',
    title: 'API Backend',
    description: 'REST API with authentication and database',
    icon: <Server className="h-5 w-5" />,
    prompt:
      'Build a REST API backend with Express.js, JWT authentication, CRUD endpoints, input validation with Zod, error handling middleware, and SQLite database using TypeScript',
    accent: 'text-rose-400',
    accentBg: 'bg-rose-500/10 border-rose-500/20',
  },
  {
    id: 'mobile',
    title: 'Mobile App',
    description: 'Cross-platform mobile app with native feel',
    icon: <Smartphone className="h-5 w-5" />,
    prompt:
      'Build a cross-platform mobile app with React Native and Expo, featuring tab navigation, user profile screen, settings page, and a clean modern UI with dark theme support',
    accent: 'text-cyan-400',
    accentBg: 'bg-cyan-500/10 border-cyan-500/20',
  },
];

export function VibeEmptyState({ onPromptSelect }: VibeEmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-3xl space-y-10">
        {/* Heading */}
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            What do you want to{' '}
            <span className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
              build
            </span>
            ?
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Pick a template to get started, or describe your idea in the prompt below.
          </p>
        </div>

        {/* Template Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => onPromptSelect(template.prompt)}
              className={cn(
                'group relative flex flex-col rounded-xl border border-border/60 bg-card/60 p-4 text-left transition-all duration-200',
                'hover:border-border hover:bg-card hover:shadow-md',
              )}
            >
              <div
                className={cn(
                  'mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border',
                  template.accentBg,
                  template.accent,
                )}
              >
                {template.icon}
              </div>

              <h3 className="mb-1 text-sm font-semibold text-foreground">{template.title}</h3>

              <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                {template.description}
              </p>

              <div className="mt-auto flex items-center gap-1 text-xs font-medium text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <span>Use template</span>
                <ArrowRight className="h-3 w-3" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
