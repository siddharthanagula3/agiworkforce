export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
        <div
          className="animate-spin motion-reduce:animate-none rounded-full h-8 w-8 border-2 border-muted-foreground/20 border-t-primary"
          aria-hidden="true"
        />
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    </div>
  );
}
