export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div role="status" aria-live="polite">
        <div
          className="h-8 w-8 animate-spin motion-reduce:animate-none rounded-full border-2 border-muted-foreground/20 border-t-primary"
          aria-hidden="true"
        />
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}
