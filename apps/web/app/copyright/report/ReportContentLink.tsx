import Link from 'next/link';

export const REPORT_ROUTE = '/copyright/report';

export function reportHref(publicPath: string): string {
  return `${REPORT_ROUTE}?url=${encodeURIComponent(publicPath)}`;
}

export function ReportContentLink({
  publicPath,
  className,
}: {
  publicPath: string;
  className?: string;
}) {
  return (
    <footer
      data-testid="report-content-link"
      className={className ?? 'px-4 py-6 text-center text-xs text-muted-foreground'}
    >
      <Link href={reportHref(publicPath)} prefetch={false} className="underline">
        Report copyright infringement or abuse
      </Link>
    </footer>
  );
}
