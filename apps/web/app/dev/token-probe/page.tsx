export default function TokenProbe() {
  return (
    <main className="bg-surface-page p-8">
      <div data-probe="surface-page" className="bg-surface-page h-4" />
      <div data-probe="surface-subtle" className="bg-surface-subtle h-4" />
      <div data-probe="surface-elevated" className="bg-surface-elevated h-4" />
      <div data-probe="surface-hover" className="bg-surface-hover h-4" />
      <p data-probe="text-primary" className="text-text-primary">
        primary
      </p>
      <p data-probe="text-secondary" className="text-text-secondary">
        secondary
      </p>
      <p data-probe="text-muted" className="text-text-muted">
        muted
      </p>
      <p data-probe="accent" className="text-accent-text">
        accent
      </p>
      <p data-probe="danger" className="text-danger-text">
        danger
      </p>
      <p data-probe="warning" className="text-warning-text">
        warning
      </p>
      <p data-probe="success" className="text-success-text">
        success
      </p>
      <p data-probe="info" className="text-info-text">
        info
      </p>
      <div data-probe="radius-control" className="rounded-control h-4" />
      <div data-probe="radius-surface" className="rounded-surface h-4" />
      <div data-probe="shadow" className="shadow-e2 h-4" />
      <div data-probe="rule" className="border border-rule h-4" />
      <div data-probe="action" className="bg-action-primary text-action-primary-foreground">
        action
      </div>
    </main>
  );
}
