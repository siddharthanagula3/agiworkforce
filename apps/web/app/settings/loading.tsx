export default function SettingsLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
        <div
          className="h-8 w-8 animate-spin motion-reduce:animate-none rounded-full border-2 border-muted-foreground/20 border-t-primary"
          aria-hidden="true"
        />
        <span className="sr-only">Loading settings</span>
      </div>
    </div>
  );
}
