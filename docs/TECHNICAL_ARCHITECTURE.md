# Technical Architecture & Best Practices

This document outlines the technical architecture, latest framework versions, and best practices for AGI Workforce.

> **Last Updated**: January 2026
> **Framework Versions**: Next.js 16.1.0, Tauri 2.9, React 19, TypeScript 5.4.5

---

## 🏗️ Framework Versions & Features

### Next.js 16.1.0

**Key Features:**

- **App Router**: File-system based routing with Server Components by default
- **Server Components**: Fetch data directly in components with async/await
- **Server Actions**: Server-side mutations with progressive enhancement
- **Stable Form Component**: Enhanced form handling with built-in validation
- **Cache Control APIs**:
  - `cacheLife()` - Declarative cache control with predefined profiles (seconds, minutes, hours, days, weeks, max)
  - `cacheTag()` - Granular cache invalidation with tag-based strategies
  - `updateTag()` and `refresh()` - Flexible cache management
- **React 19 Compatibility**: Improved Server Actions and form handling

**Best Practices:**

1. **Data Fetching in Server Components**

   ```typescript
   // app/posts/page.tsx
   export default async function Page() {
     // Force cache (default) - similar to getStaticProps
     const staticData = await fetch('https://api.example.com/data', {
       cache: 'force-cache'
     })

     // No store - always fresh - similar to getServerSideProps
     const dynamicData = await fetch('https://api.example.com/data', {
       cache: 'no-store'
     })

     // Revalidate - cache with lifetime
     const revalidatedData = await fetch('https://api.example.com/data', {
       next: { revalidate: 3600 } // 1 hour
     })

     // Tag-based revalidation
     const taggedData = await fetch('https://api.example.com/data', {
       next: { tags: ['products'] }
     })

     return <PostsList data={await staticData.json()} />
   }
   ```

2. **Server Actions**

   ```typescript
   // app/actions.ts
   'use server';

   export async function createPost(formData: FormData) {
     const title = formData.get('title');
     // Server-side validation and database operations
     await db.posts.create({ title });
     revalidateTag('posts');
   }
   ```

3. **Route Handlers** (replacing API Routes)

   ```typescript
   // app/api/posts/route.ts
   import { NextRequest, NextResponse } from 'next/server';

   export async function GET(request: NextRequest) {
     const posts = await db.posts.findMany();
     return NextResponse.json(posts);
   }
   ```

---

### Tauri 2.9

**Key Features:**

- **Enhanced Plugin System**: Modular architecture with improved maintainability
- **Multi-Webview Support**: Multiple webview windows (experimental, behind feature flag)
- **Swift/Kotlin Bindings**: Platform-specific code in Swift (iOS/macOS) and Kotlin (Android)
- **Mobile Support**: Experimental iOS and Android support
- **Improved IPC**: Enhanced IPC communication with `tauri::ipc::Channel`
- **Window Management**: New `WebviewWindow` and `WebviewWindowBuilder` APIs
- **Deep Link Support**: Handle deep links with `tauri::RunEvent::Opened`

**Best Practices:**

1. **Plugin Usage**

   ```javascript
   // Use plugin-based APIs instead of deprecated @tauri-apps/api
   import { check } from '@tauri-apps/plugin-updater';
   import { relaunch } from '@tauri-apps/plugin-process';
   import { arch } from '@tauri-apps/plugin-os';

   // Check for updates
   const update = await check();
   if (update.response.available) {
     await update.downloadAndInstall();
     await relaunch();
   }
   ```

2. **IPC Communication**

   ```rust
   // Rust backend
   use tauri::ipc::Channel;

   #[tauri::command]
   async fn send_data(channel: Channel<String>) {
       channel.send("Hello from Rust!").await;
   }
   ```

   ```typescript
   // TypeScript frontend
   import { Channel } from '@tauri-apps/api/core';

   const channel = new Channel<string>();
   channel.onmessage = (msg) => console.log(msg);
   await invoke('send_data', { channel });
   ```

3. **Window Management**

   ```rust
   use tauri::{WebviewWindow, WebviewWindowBuilder};

   let window = WebviewWindowBuilder::new("new-window")
       .title("New Window")
       .inner_size(800.0, 600.0)
       .build(app)?;
   ```

---

### Supabase JS Client

**Key Features:**

- **SSR Integration**: Cookie-based authentication with `@supabase/ssr` for Next.js
- **Real-time Subscriptions**: WebSocket-based real-time updates
- **Type Safety**: TypeScript support with generated types
- **Third-party Auth**: Support for Firebase, Auth0, AWS Cognito via `accessToken` option

**Best Practices:**

1. **Next.js App Router Integration**

   ```typescript
   // lib/supabase/server.ts
   import { createServerClient } from '@supabase/ssr';
   import { cookies } from 'next/headers';

   export async function createClient() {
     const cookieStore = await cookies();

     return createServerClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
       {
         cookies: {
           getAll() {
             return cookieStore.getAll();
           },
           setAll(cookiesToSet) {
             try {
               cookiesToSet.forEach(({ name, value, options }) =>
                 cookieStore.set(name, value, options),
               );
             } catch {
               // Handle cookie setting errors
             }
           },
         },
       },
     );
   }
   ```

2. **Client Component Usage**

   ```typescript
   // lib/supabase/client.ts
   import { createBrowserClient } from '@supabase/ssr';

   export function createClient() {
     return createBrowserClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
     );
   }
   ```

3. **Authentication State Changes**

   ```typescript
   import { createClient } from '@/lib/supabase/client';

   const supabase = createClient();

   const {
     data: { subscription },
   } = supabase.auth.onAuthStateChange((event, session) => {
     console.log('Auth event:', event);
     if (session) {
       console.log('User ID:', session.user.id);
     }
   });

   // Cleanup
   subscription.unsubscribe();
   ```

4. **Real-time Subscriptions**
   ```typescript
   const channel = supabase
     .channel('posts')
     .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
       console.log('New post:', payload.new);
     })
     .subscribe();
   ```

---

## 🔧 Development Best Practices

### TypeScript 5.4.5

**Key Features:**

- Enhanced type inference
- Improved error messages
- Better support for decorators
- Enhanced module resolution

**Best Practices:**

- Use strict mode: `"strict": true` in `tsconfig.json`
- Enable `noUncheckedIndexedAccess` for safer array/object access
- Use type guards for runtime type checking
- Leverage discriminated unions for state management

### React 19

**Key Features:**

- Server Components (via Next.js)
- Enhanced form handling
- Improved hydration
- Better error boundaries

**Best Practices:**

- Use Server Components by default, Client Components when needed
- Mark Client Components with `'use client'` directive
- Use Server Actions for mutations
- Leverage React 19's improved form handling

---

## 📦 Package Management

### pnpm Workspaces

The project uses pnpm workspaces for monorepo management:

```json
{
  "packageManager": "pnpm@9.15.3",
  "engines": {
    "node": ">=20.11.0 <23",
    "pnpm": ">=9.15.0 <11"
  }
}
```

**Best Practices:**

- Use workspace protocol (`workspace:*`) for internal packages
- Run commands with `pnpm -r` for all packages
- Use `pnpm --filter <package>` for specific packages

---

## 🚀 Performance Optimization

### Next.js Optimization

1. **Image Optimization**: Use `next/image` for automatic optimization
2. **Font Optimization**: Use `next/font` for font loading
3. **Code Splitting**: Automatic with App Router
4. **Streaming**: Use Suspense boundaries for progressive rendering

### Tauri Optimization

1. **Bundle Size**: Tauri apps are significantly smaller than Electron
2. **Memory Usage**: Lower memory footprint with Rust backend
3. **Startup Time**: Faster startup with optimized Rust code

---

## 🔒 Security Best Practices

1. **API Keys**: Store in OS keyring (Tauri) or environment variables (Next.js)
2. **Authentication**: Use Supabase Auth with PKCE flow
3. **CORS**: Configure properly for API routes
4. **Input Validation**: Validate all user inputs
5. **SQL Injection**: Use parameterized queries (Supabase handles this)

---

## 📚 Additional Resources

- [Next.js 16.1.0 Documentation](https://nextjs.org/docs)
- [Tauri 2.9 Documentation](https://tauri.app/)
- [Supabase JS Documentation](https://supabase.com/docs/reference/javascript)
- [React 19 Documentation](https://react.dev/)
- [TypeScript 5.4 Documentation](https://www.typescriptlang.org/docs/)

---

_This document is maintained with the latest framework versions and best practices._
