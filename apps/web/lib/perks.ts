export interface Perk {
  id: string;
  partner: string;
  title: string;
  description: string;
  ctaUrl: string;
  ctaText: string;
  logoUrl?: string;
}

export const PERKS: Perk[] = [
  {
    id: 'aws-credits',
    partner: 'AWS',
    title: '$5,000 in AWS credits',
    description:
      'Activate $5,000 in AWS infrastructure credits for your team. Valid for new AWS customers via the AGI Workforce partner portal.',
    ctaUrl: 'mailto:partnerships@agiworkforce.com?subject=AWS%20Credits%20Perk',
    ctaText: 'Claim credits',
  },
  {
    id: 'linear-3mo',
    partner: 'Linear',
    title: '3 months of Linear free',
    description:
      'Ship faster with Linear project tracking. AGI Workforce teams get 3 months free on any plan, no credit card required.',
    ctaUrl: 'mailto:partnerships@agiworkforce.com?subject=Linear%20Perk',
    ctaText: 'Get access',
  },
  {
    id: 'vercel-pro',
    partner: 'Vercel',
    title: 'Vercel Pro for 90 days',
    description:
      'Deploy your AI-powered apps on Vercel with full Pro features for 90 days. Includes preview deployments, analytics, and edge functions.',
    ctaUrl: 'mailto:partnerships@agiworkforce.com?subject=Vercel%20Perk',
    ctaText: 'Activate',
  },
  {
    id: 'notion-team',
    partner: 'Notion',
    title: 'Notion Team plan, 6 months',
    description:
      'Pair your AI workflows with Notion. All AGI Workforce subscribers get 6 months of the Notion Team plan at no cost.',
    ctaUrl: 'mailto:partnerships@agiworkforce.com?subject=Notion%20Perk',
    ctaText: 'Unlock',
  },
  {
    id: 'retool-starter',
    partner: 'Retool',
    title: 'Retool Starter, first year free',
    description:
      'Build internal tools faster. AGI Workforce users get the first year of Retool Starter free to power dashboards and ops tooling.',
    ctaUrl: 'mailto:partnerships@agiworkforce.com?subject=Retool%20Perk',
    ctaText: 'Apply',
  },
];
