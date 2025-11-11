# CLAUDE.md - AGI Workforce Website Development

## Project Context

You are building the **AGI Workforce marketing and product website** based on the comprehensive PRD document located at `WEBSITE_PRD.md`. This is a greenfield project to create a modern, conversion-optimized SaaS website from scratch.

## Your Mission

Build a complete, production-ready marketing website for AGI Workforce following the specifications in `WEBSITE_PRD.md`. The website must:

- Drive desktop application downloads
- Convert visitors to paying subscribers
- Provide excellent documentation
- Achieve top SEO performance
- Deliver exceptional user experience

## Required Reading

**Before starting ANY work, you MUST read and understand:**

- `WEBSITE_PRD.md` - Complete product requirements document (this is your source of truth)

## Technology Stack

### Frontend Framework: Next.js 14+ (App Router)

**Rationale:**

- Server-side rendering (SSR) for optimal SEO
- Built-in image optimization
- File-based routing
- Edge runtime support
- Excellent developer experience

### Styling: Tailwind CSS

**Rationale:**

- Utility-first approach matches PRD's design system
- Rapid prototyping
- Consistent design tokens
- Small bundle size with purging

### UI Components: Radix UI + shadcn/ui

**Rationale:**

- Accessible by default (WCAG 2.1 AA)
- Unstyled primitives (full design control)
- Keyboard navigation built-in
- Production-ready components

### Content Management: MDX (for docs/blog)

**Rationale:**

- Git-based content (version control)
- React components in markdown
- Fast builds
- No database overhead

### Animations: Framer Motion

**Rationale:**

- Declarative animations
- Spring physics
- Scroll-triggered animations
- Excellent performance

### SEO: next-seo

**Rationale:**

- Meta tag management
- Open Graph support
- JSON-LD structured data
- Sitemap generation

### Analytics: Vercel Analytics + Google Analytics 4

**Rationale:**

- Privacy-friendly (Vercel)
- Comprehensive tracking (GA4)
- No cookie consent needed (Vercel)

### Forms: React Hook Form + Zod

**Rationale:**

- Type-safe validation
- Excellent performance
- Small bundle size
- Great DX

### Deployment: Vercel

**Rationale:**

- Built for Next.js
- Global CDN
- Edge functions
- Automatic HTTPS
- Preview deployments

## Project Structure

Create the website in a new directory: `apps/website/`

```
apps/website/
├── app/                          # Next.js 14 app directory
│   ├── (marketing)/              # Marketing pages layout group
│   │   ├── page.tsx              # Homepage
│   │   ├── features/
│   │   │   └── page.tsx
│   │   ├── pricing/
│   │   │   └── page.tsx
│   │   ├── enterprise/
│   │   │   └── page.tsx
│   │   ├── changelog/
│   │   │   └── page.tsx
│   │   ├── download/
│   │   │   └── page.tsx
│   │   └── layout.tsx            # Marketing layout with header/footer
│   ├── (docs)/                   # Documentation layout group
│   │   ├── docs/
│   │   │   ├── [[...slug]]/
│   │   │   │   └── page.tsx      # Dynamic doc pages
│   │   │   └── layout.tsx        # Docs layout with sidebar
│   │   └── layout.tsx
│   ├── (legal)/                  # Legal pages
│   │   ├── privacy/
│   │   ├── terms/
│   │   └── refund/
│   ├── blog/
│   │   ├── [slug]/
│   │   │   └── page.tsx
│   │   └── page.tsx
│   ├── api/                      # API routes
│   │   ├── download/             # Download tracking
│   │   ├── contact/              # Contact form handler
│   │   └── newsletter/           # Newsletter signup
│   ├── layout.tsx                # Root layout
│   ├── globals.css               # Global styles
│   └── sitemap.ts                # Dynamic sitemap
├── components/
│   ├── ui/                       # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   └── ...
│   ├── marketing/                # Marketing components
│   │   ├── hero-section.tsx
│   │   ├── feature-card.tsx
│   │   ├── pricing-card.tsx
│   │   ├── testimonial-card.tsx
│   │   ├── faq-accordion.tsx
│   │   └── cta-section.tsx
│   ├── layout/                   # Layout components
│   │   ├── header.tsx
│   │   ├── footer.tsx
│   │   ├── mobile-menu.tsx
│   │   └── theme-toggle.tsx
│   ├── docs/                     # Documentation components
│   │   ├── docs-sidebar.tsx
│   │   ├── docs-search.tsx
│   │   ├── table-of-contents.tsx
│   │   └── code-block.tsx
│   └── forms/                    # Form components
│       ├── contact-form.tsx
│       ├── newsletter-form.tsx
│       └── enterprise-form.tsx
├── content/
│   ├── docs/                     # MDX documentation files
│   │   ├── getting-started/
│   │   ├── core-concepts/
│   │   ├── features/
│   │   └── ...
│   ├── blog/                     # MDX blog posts
│   └── changelog.json            # Changelog data
├── lib/
│   ├── mdx.ts                    # MDX processing utilities
│   ├── seo.ts                    # SEO utilities
│   ├── analytics.ts              # Analytics helpers
│   └── utils.ts                  # General utilities
├── config/
│   ├── site.ts                   # Site configuration
│   ├── docs.ts                   # Docs navigation config
│   └── pricing.ts                # Pricing tiers config
├── styles/
│   └── mdx.css                   # MDX-specific styles
├── public/
│   ├── images/
│   │   ├── hero/
│   │   ├── features/
│   │   ├── logos/
│   │   └── og/                   # Open Graph images
│   ├── videos/
│   ├── fonts/
│   └── downloads/                # Installer files (if hosted)
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

## Development Workflow

### Phase 1: Project Setup & Foundation

**Duration: 1 session**

1. **Initialize Next.js Project**

   ```bash
   cd apps/
   npx create-next-app@latest website --typescript --tailwind --app --src-dir=false --import-alias="@/*"
   cd website
   ```

2. **Install Dependencies**

   ```bash
   pnpm add @radix-ui/react-accordion @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-navigation-menu @radix-ui/react-tabs framer-motion react-hook-form zod @hookform/resolvers next-seo next-themes contentlayer next-contentlayer date-fns lucide-react
   pnpm add -D @tailwindcss/typography @types/node
   ```

3. **Setup shadcn/ui**

   ```bash
   npx shadcn-ui@latest init
   npx shadcn-ui@latest add button card input label textarea accordion dialog dropdown-menu navigation-menu tabs
   ```

4. **Configure Tailwind (following PRD color palette)**
   - Deep navy/charcoal backgrounds
   - Electric blue accents (#4F46E5, #6366F1)
   - Success green (#10B981), amber (#F59E0B), red (#EF4444)
   - Typography scale (16-18px base, 48-72px headings)

5. **Setup Site Configuration**
   - Create `config/site.ts` with site metadata
   - SEO defaults, social links, navigation structure

### Phase 2: Core Layout & Components

**Duration: 1-2 sessions**

1. **Root Layout (`app/layout.tsx`)**
   - HTML structure with proper meta tags
   - Font optimization (Inter/Manrope)
   - Theme provider
   - Analytics scripts
   - Global styles

2. **Marketing Layout (`app/(marketing)/layout.tsx`)**
   - Header component (sticky with blur on scroll)
   - Footer component (multi-column as per PRD)
   - Mobile menu
   - Theme toggle

3. **Header Component**
   - Logo (link to home)
   - Navigation links (Features, Docs, Pricing, Enterprise, Blog, Changelog)
   - Theme toggle (sun/moon icon)
   - "Sign In" button
   - "Download for Windows" button (with OS detection)
   - Mobile hamburger menu

4. **Footer Component**
   - 5-column layout (Company, Product, Resources, Legal, Support)
   - Social media icons
   - Copyright notice
   - Theme toggle
   - Language selector (EN)

### Phase 3: Homepage Implementation

**Duration: 2-3 sessions**

Implement all sections from `WEBSITE_PRD.md` Section 1 (HOMEPAGE):

1. **Hero Section (1.2)**
   - Gradient background (deep navy to purple)
   - Large headline: "Your Autonomous Workforce, Powered by AI"
   - Subheadline
   - Primary CTA: "Download for Windows"
   - Secondary CTA: "Watch Demo"
   - Social proof metrics
   - Hero visual (Option A/B/C from PRD)
   - Scroll indicator

2. **Social Proof Section (1.3)**
   - Company logo wall (8-12 logos, grayscale with color hover)
   - Stats bar (1M+ Tasks Automated, 10,000+ Active Users, etc.)

3. **Core Value Propositions (1.4)**
   - 3-column card layout (stacked on mobile)
   - Card 1: Multi-LLM Intelligence
   - Card 2: Native Desktop Control
   - Card 3: Your Data Stays Yours

4. **Features Deep Dive (1.5)**
   - Alternating left-right layout
   - 6 features with visuals and bullet points
   - Implement all features from PRD

5. **Use Cases Section (1.6)**
   - Grid of 8 cards
   - Icons, titles, descriptions

6. **How It Works (1.7)**
   - 4-step timeline/process
   - Visuals for each step

7. **Comparison Section (1.8)**
   - Comparison table (Traditional RPA vs AGI Workforce)

8. **Pricing Section (1.9)**
   - 3 pricing tier cards
   - Free, Pro ($10 first month), Enterprise
   - "MOST POPULAR" badge on Pro
   - All features listed per tier

9. **Testimonials Section (1.10)**
   - Carousel or grid
   - 4 testimonial cards with quotes, author, role, photo

10. **FAQ Section (1.11)**
    - Accordion-style
    - 10 questions from PRD

11. **Final CTA Section (1.12)**
    - Gradient background
    - Headline, subheadline
    - Two CTAs (Download, Schedule Demo)

### Phase 4: Additional Marketing Pages

**Duration: 1-2 sessions**

1. **Features Page (`app/(marketing)/features/page.tsx`)**
   - Expanded feature descriptions
   - More detailed visuals
   - Use cases per feature

2. **Pricing Page (`app/(marketing)/pricing/page.tsx`)**
   - Detailed pricing comparison
   - FAQ specific to pricing
   - Monthly/annual toggle

3. **Enterprise Page (`app/(marketing)/enterprise/page.tsx`)**
   - Enterprise-focused messaging
   - Enterprise features
   - Contact form
   - Custom pricing CTA

4. **Changelog Page (`app/(marketing)/changelog/page.tsx`)**
   - Reverse chronological list
   - Version numbers, dates, categories
   - Example from PRD (v1.2.0)

5. **Download Page (`app/(marketing)/download/page.tsx`)**
   - OS-specific download buttons
   - System requirements
   - Installation instructions
   - Checksums

### Phase 5: Documentation System

**Duration: 2-3 sessions**

1. **Setup Contentlayer**
   - Configure `contentlayer.config.ts`
   - Define schemas for docs and blog
   - Setup MDX processing

2. **Docs Layout (`app/(docs)/docs/layout.tsx`)**
   - Sidebar navigation (collapsible on mobile)
   - Search bar
   - Breadcrumbs
   - Version selector

3. **Docs Dynamic Page (`app/(docs)/docs/[[...slug]]/page.tsx`)**
   - MDX rendering
   - Table of contents (right sidebar)
   - "Was this helpful?" buttons
   - "Next article" navigation
   - Last updated date

4. **Docs Sidebar Component**
   - Hierarchical navigation from PRD (Getting Started, Core Concepts, etc.)
   - Active state highlighting
   - Collapsible sections

5. **Docs Search**
   - Implement Algolia DocSearch or custom search
   - Keyboard shortcuts (Cmd+K)
   - Instant results

6. **Create Documentation Content**
   - Write MDX files for all articles listed in PRD Section 2.2
   - Installation Guide
   - Quick Start Tutorial
   - LLM Configuration
   - Desktop Automation Guide
   - Browser Automation Guide
   - Workflow Building
   - Security Best Practices

### Phase 6: Blog System (Optional)

**Duration: 1 session**

1. **Blog Index Page (`app/blog/page.tsx`)**
   - Card-based grid
   - Category filter
   - Search
   - Recent posts widget

2. **Blog Post Page (`app/blog/[slug]/page.tsx`)**
   - MDX rendering
   - Author info
   - Read time
   - Social share buttons

3. **Create Sample Blog Posts**
   - Implement ideas from PRD Section 5.2

### Phase 7: Forms & Interactivity

**Duration: 1-2 sessions**

1. **Contact Form**
   - React Hook Form + Zod validation
   - Fields: Name, Email, Company, Team Size, Message
   - API route for submission
   - Success/error states

2. **Enterprise Demo Form**
   - Similar to contact form
   - Additional fields for enterprise context

3. **Newsletter Signup**
   - Email input in footer
   - API route for submission
   - Double opt-in flow

4. **Demo Video Modal**
   - Dialog component
   - Embedded video (YouTube/Vimeo)
   - Close on outside click

5. **Cookie Consent Banner**
   - GDPR/CCPA compliant
   - "Accept All", "Reject All", "Customize" buttons
   - Preferences modal

6. **OS Detection for Download Button**
   - Detect user's OS (Windows/macOS/Linux)
   - Change button text dynamically
   - Trigger correct download

### Phase 8: SEO Implementation

**Duration: 1 session**

1. **Meta Tags**
   - Implement unique title tags per page (from PRD Section 710)
   - Meta descriptions
   - Open Graph tags
   - Twitter Card tags
   - Canonical URLs

2. **Structured Data**
   - Organization schema
   - Product schema
   - SoftwareApplication schema
   - FAQ schema
   - Article schema (blog)
   - BreadcrumbList schema (docs)

3. **Sitemap**
   - Generate dynamic sitemap (`app/sitemap.ts`)
   - Include all pages, docs, blog posts

4. **robots.txt**
   - Allow public pages
   - Block admin areas

5. **Image Optimization**
   - All images with alt text
   - Descriptive filenames
   - WebP format with fallbacks
   - Lazy loading

### Phase 9: Performance Optimization

**Duration: 1 session**

1. **Code Splitting**
   - Dynamic imports for heavy components
   - Route-based splitting (automatic in Next.js)

2. **Font Optimization**
   - Use `next/font` for Inter/Manrope
   - Subset fonts if possible
   - `font-display: swap`

3. **Image Optimization**
   - Use `next/image` everywhere
   - Proper sizes and srcset
   - Priority loading for hero images

4. **Critical CSS**
   - Inline critical CSS for above-the-fold content

5. **Run Lighthouse Audit**
   - Target: Performance 90+, Accessibility 95+, Best Practices 95+, SEO 100

### Phase 10: Accessibility Audit

**Duration: 1 session**

1. **Keyboard Navigation**
   - Test all interactive elements with Tab
   - Visible focus indicators
   - Logical tab order
   - Skip to main content link

2. **Screen Reader Testing**
   - Proper semantic HTML
   - ARIA labels where needed
   - Alt text on all images
   - Form labels

3. **Color Contrast**
   - Verify 4.5:1 ratio for normal text
   - 3:1 for large text
   - Test with contrast checker

4. **Responsive Design**
   - Test on mobile (320px+), tablet (768px+), desktop (1024px+)
   - Touch targets 44x44px minimum
   - No pinch-zoom disabled

### Phase 11: Analytics & Tracking

**Duration: 1 session**

1. **Setup Vercel Analytics**
   - Add to root layout
   - Track page views

2. **Setup Google Analytics 4**
   - Add tracking code
   - Configure events (downloads, signups, form submissions)

3. **Conversion Tracking**
   - Track download button clicks
   - Track form submissions
   - Track pricing page visits

4. **Setup Google Search Console**
   - Submit sitemap
   - Verify ownership

### Phase 12: Legal Pages

**Duration: 1 session**

1. **Privacy Policy Page**
   - Data collection practices
   - GDPR/CCPA compliance
   - Cookie policy

2. **Terms of Service Page**
   - Legal terms
   - User responsibilities

3. **Refund Policy Page**
   - 30-day money-back guarantee
   - Refund process

### Phase 13: Final Polish & Testing

**Duration: 1-2 sessions**

1. **Cross-Browser Testing**
   - Chrome, Firefox, Safari, Edge
   - Fix any browser-specific issues

2. **Mobile Testing**
   - Test on real devices if possible
   - iOS Safari, Android Chrome

3. **404 Page**
   - Design custom 404
   - Helpful navigation back to site

4. **Loading States**
   - Skeleton screens where appropriate
   - Spinners for async operations

5. **Error Handling**
   - Error boundaries
   - Graceful degradation

6. **Final Proofreading**
   - Check all copy for typos
   - Verify all links work
   - Test all forms

### Phase 14: Deployment

**Duration: 1 session**

1. **Setup Vercel Project**
   - Connect GitHub repo
   - Configure build settings
   - Set environment variables

2. **Domain Configuration**
   - Point domain to Vercel
   - Setup SSL (automatic)

3. **Deploy to Production**
   - Merge to main branch
   - Verify deployment

4. **Post-Deployment Checks**
   - Test all functionality on production
   - Verify analytics tracking
   - Check all forms
   - Run Lighthouse audit on live site

## Implementation Guidelines

### Code Quality Standards

1. **TypeScript**
   - Use strict mode
   - Proper type definitions
   - No `any` types (use `unknown` if needed)

2. **Component Structure**
   - Functional components with hooks
   - Props interfaces defined
   - Default exports for pages, named exports for components

3. **Styling**
   - Tailwind utility classes
   - Custom classes in globals.css only when necessary
   - Consistent spacing (8px base unit)

4. **File Naming**
   - kebab-case for files: `hero-section.tsx`
   - PascalCase for components: `HeroSection`

5. **Imports**
   - Use path aliases: `@/components/...`
   - Group imports: external → internal → types

### Design System Reference

From PRD, implement these exact specifications:

**Colors (Tailwind Config)**

```typescript
colors: {
  navy: {
    DEFAULT: '#0A0E27',
    50: '#F9FAFB',
    // ... full scale
  },
  blue: {
    500: '#4F46E5',
    600: '#6366F1',
  },
  // ... others from PRD
}
```

**Typography**

- Base: 16-18px (text-base)
- Headings: 48-72px desktop (text-5xl to text-7xl)
- Subheadings: 24-32px (text-2xl to text-3xl)
- Line heights: tight for headings (1.1-1.2), relaxed for body (1.6-1.8)

**Spacing**

- Consistent 8px base unit
- Use Tailwind's spacing scale (4, 8, 12, 16, 24, 32, 48, 64, etc.)

**Animations**

- Duration: 0.3s (duration-300)
- Easing: ease-out
- Hover: scale(1.05) or translate
- Scroll-triggered: fade-ins, slide-ups

### Content Guidelines

1. **Copy Tone** (from PRD Section "Content Tone & Voice Guidelines")
   - Professional but approachable
   - Empowering
   - Clear and concise
   - Confident
   - User-centric (benefits over features)

2. **Example Phrasing** (use these patterns)
   - ✅ "Choose the perfect AI for every task - OpenAI for creativity, Anthropic for analysis, or Ollama for zero-cost local inference"
   - ❌ "AGI Workforce contains multiple LLM providers that can be configured"

3. **Imagery**
   - Use placeholder images initially (via unsplash or placeholder services)
   - Descriptive alt text always
   - WebP format + fallbacks

### Critical Requirements

**MUST IMPLEMENT:**

- ✅ All sections from PRD Homepage (1.1 through 1.13)
- ✅ Pricing: Free ($0), Pro ($10 first month, then $20), Enterprise (custom)
- ✅ 50% off first month prominently displayed
- ✅ OS detection for download button
- ✅ Dark/light theme toggle
- ✅ Mobile responsive (320px+)
- ✅ SEO meta tags on every page
- ✅ Structured data (JSON-LD)
- ✅ Sitemap and robots.txt
- ✅ Accessibility (WCAG 2.1 AA)
- ✅ Performance (Lighthouse 90+)
- ✅ Cookie consent banner
- ✅ Forms with validation

**MUST NOT DO:**

- ❌ Use emojis (unless explicitly in PRD)
- ❌ Add features not in PRD without asking
- ❌ Deviate from color palette
- ❌ Skip accessibility features
- ❌ Forget SEO on any page
- ❌ Use low-quality placeholder images in production

## Testing Checklist

Before marking any phase complete, verify:

- [ ] TypeScript compiles with no errors
- [ ] ESLint passes with no errors
- [ ] All links work (no 404s)
- [ ] All forms submit successfully
- [ ] Mobile responsive (test 320px, 768px, 1024px)
- [ ] Dark mode works correctly
- [ ] Images load and have alt text
- [ ] Lighthouse scores meet targets
- [ ] Screen reader navigation works
- [ ] Keyboard navigation works
- [ ] All content matches PRD specifications

## Performance Targets

From PRD Section "Performance Requirements":

- First Contentful Paint (FCP): < 1.5s
- Largest Contentful Paint (LCP): < 2.5s
- Time to Interactive (TTI): < 3.5s
- Cumulative Layout Shift (CLS): < 0.1

**Lighthouse Score Targets:**

- Performance: 90+
- Accessibility: 95+
- Best Practices: 95+
- SEO: 100

## Common Pitfalls to Avoid

1. **Don't hardcode content** - Use config files for reusable data (pricing tiers, features, etc.)
2. **Don't forget mobile** - Design mobile-first, then enhance for desktop
3. **Don't skip SEO** - Every page needs unique title, description, and OG tags
4. **Don't ignore accessibility** - Use semantic HTML, ARIA labels, keyboard navigation
5. **Don't bloat bundle** - Code split, lazy load, optimize images
6. **Don't forget error states** - Handle loading, error, and empty states
7. **Don't skip testing** - Test forms, navigation, responsiveness

## Questions to Ask Before Starting

If anything is unclear from the PRD:

1. Should blog be implemented in Phase 1 or deferred?
2. What placeholder images should be used temporarily?
3. Should demo video be embedded (YouTube) or self-hosted?
4. What email service for newsletter/forms? (SendGrid, Mailchimp, etc.)
5. Should there be a staging environment?

## Success Criteria

The website is complete when:

- ✅ All pages from PRD are implemented and match specifications
- ✅ All forms work and submit data
- ✅ Download button detects OS and triggers correct download
- ✅ Documentation is searchable and navigable
- ✅ Lighthouse scores meet all targets (90+/95+/95+/100)
- ✅ Accessibility audit passes (WCAG 2.1 AA)
- ✅ Mobile responsive on all devices
- ✅ SEO is fully implemented (meta tags, structured data, sitemap)
- ✅ Analytics tracking is functional
- ✅ Site is deployed to production and accessible
- ✅ All content is proofread and error-free

## Maintenance After Launch

Post-launch tasks (from PRD "Post-Launch" checklist):

- Submit sitemap to Google Search Console
- Monitor analytics and conversion rates
- Collect user feedback
- A/B test CTAs and headlines
- Start content marketing (blog posts)
- Monitor performance and fix issues

## Getting Help

If you encounter issues:

1. Refer back to `WEBSITE_PRD.md` for clarification
2. Check Next.js documentation for framework-specific issues
3. Consult Tailwind/Radix UI docs for component/styling issues
4. Ask for clarification on ambiguous requirements

## Final Notes

- **Stay focused on the PRD** - It contains everything you need
- **Ask before deviating** - If something seems missing or unclear, ask
- **Prioritize user experience** - Fast, accessible, beautiful
- **Prioritize SEO** - This is a marketing site, discovery is critical
- **Prioritize conversion** - Every element should drive downloads or signups
- **Work incrementally** - Complete one phase before moving to the next
- **Test continuously** - Don't wait until the end to test
- **Document decisions** - Update this file if you make architectural choices

---

**Remember:** The PRD (`WEBSITE_PRD.md`) is your complete specification. Every requirement is documented there. Read it thoroughly before starting each phase.

Good luck! 🚀
