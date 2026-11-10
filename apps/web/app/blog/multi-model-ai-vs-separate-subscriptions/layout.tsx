import type { ReactNode } from 'react';
import { SUBSCRIPTION_GUIDE } from '@/lib/blog-posts';
import { articleSchema, breadcrumbSchema } from '@/lib/seo/structured-data';
import { JsonLd } from '@shared/components/seo/JsonLd';

export default function SubscriptionGuideLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <JsonLd
        data={[
          articleSchema(SUBSCRIPTION_GUIDE),
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Blog', path: '/blog' },
            { name: SUBSCRIPTION_GUIDE.title, path: SUBSCRIPTION_GUIDE.path },
          ]),
        ]}
      />
      {children}
    </>
  );
}
