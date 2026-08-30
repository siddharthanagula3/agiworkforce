export default function PricingLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-4">
        <div role="status" aria-live="polite">
          <div
            className="animate-spin motion-reduce:animate-none rounded-full h-8 w-8 border-2 border-muted-foreground/20 border-t-primary"
            aria-hidden="true"
          />
          <span className="sr-only">Loading</span>
        </div>
        <p className="text-sm text-zinc-500">Loading pricing...</p>
      </div>
    </div>
  );
}
