export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-700 border-t-blue-500" />
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    </div>
  );
}
