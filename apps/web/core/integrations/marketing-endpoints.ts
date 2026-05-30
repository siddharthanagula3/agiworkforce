// Marketing Website API Services
// Connects frontend to API routes and database

const API_BASE = '';

// ============================================================================
// BLOG POSTS
// ============================================================================

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  image_url?: string;
  author: {
    id: string;
    display_name: string;
    avatar_emoji: string;
  };
  category: {
    id: string;
    name: string;
    slug: string;
  };
  published_at: string;
  read_time: string;
  views: number;
  featured: boolean;
}

export interface BlogPostsParams {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
  featured?: boolean;
}

export async function getBlogPosts(params: BlogPostsParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.category) queryParams.set('category', params.category);
  if (params.search) queryParams.set('search', params.search);
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.offset) queryParams.set('offset', params.offset.toString());
  if (params.featured) queryParams.set('featured', 'true');

  const response = await fetch(`${API_BASE}/api/blog?${queryParams}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch blog posts');
  }

  return response.json();
}

export async function getBlogCategories() {
  // TODO: implement via /api/blog/categories once route is available.
  return [];
}

// ============================================================================
// RESOURCES
// ============================================================================

export interface Resource {
  id: string;
  title: string;
  description: string;
  type: 'Guide' | 'Template' | 'Video' | 'Ebook' | 'Webinar';
  category: string;
  duration?: string;
  download_count: number;
  thumbnail_url?: string;
  featured: boolean;
}

export async function getResources(type?: string) {
  // TODO: implement via /api/resources once route is available.
  void type;
  return [] as Resource[];
}

// ============================================================================
// PRICING PLANS
// ============================================================================

export interface PricingPlan {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  features: string[];
  not_included?: string[];
  popular: boolean;
  color_gradient: string;
}

export async function getPricingPlans() {
  // TODO: implement via /api/pricing-plans once route is available.
  return [] as PricingPlan[];
}

// ============================================================================
// HELP & SUPPORT
// ============================================================================

export interface SupportCategory {
  id: string;
  title: string;
  slug: string;
  description: string;
  icon: string;
  color_gradient: string;
  article_count: number;
}

export interface HelpArticle {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  views: number;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
}

export async function getSupportCategories() {
  // TODO: implement via /api/support/categories once route is available.
  return [] as SupportCategory[];
}

export async function getHelpArticles(_categorySlug?: string) {
  // TODO: implement via /api/support/articles once route is available.
  return [];
}

export async function getFAQItems() {
  // TODO: implement via /api/support/faq once route is available.
  return [] as FAQItem[];
}

// ============================================================================
// SUPPORT TICKETS (Authenticated Users Only)
// ============================================================================

export interface SupportTicket {
  subject: string;
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  category_id?: string;
}

export async function createSupportTicket(ticket: SupportTicket) {
  // TODO: implement via /api/support/tickets once route is available.
  return ticket as unknown as SupportTicket & { id: string };
}

export async function getUserTickets() {
  // TODO: implement via /api/support/tickets once route is available.
  return [];
}
