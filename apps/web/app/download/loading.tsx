export default function DownloadLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div
        role="status"
        aria-label="Loading download options"
        aria-live="polite"
        className="flex flex-col items-center gap-4"
      >
        <div
          aria-hidden="true"
          className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"
        />
        <p className="text-sm text-muted-foreground">Loading download options…</p>
      </div>
    </div>
  );
}
