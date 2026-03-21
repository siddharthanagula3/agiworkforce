// Chat is served via Next.js rewrite in next.config.ts
// /chat → proxies to chat.agiworkforce.com (same domain, auth cookies work)
// This layout is bypassed by the rewrite — kept as fallback
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
