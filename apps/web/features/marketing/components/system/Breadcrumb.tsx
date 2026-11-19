import { PageLink } from '@shared/components/layout/EmbeddedPage';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: readonly BreadcrumbItem[] }) {
  const lastIndex = items.length - 1;
  return (
    <nav aria-label="Breadcrumb">
      <ol className="agi-ds-crumb">
        {items.map((item, index) => (
          <li
            key={`${item.label}-${index}`}
            aria-current={index === lastIndex ? 'page' : undefined}
          >
            {item.href && index !== lastIndex ? (
              <PageLink href={item.href} className="agi-ds-crumb-link">
                {item.label}
              </PageLink>
            ) : (
              <span className="agi-ds-crumb-text">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
