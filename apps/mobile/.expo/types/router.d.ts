/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string | object = string> {
      hrefInputParams:
        | { pathname: Router.RelativePathString; params?: Router.UnknownInputParams }
        | { pathname: Router.ExternalPathString; params?: Router.UnknownInputParams }
        | { pathname: `/_sitemap`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}` | `/`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/agents` | `/agents`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/companion` | `/companion`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/messaging` | `/messaging`; params?: Router.UnknownInputParams }
        | {
            pathname: `${'/(app)'}/schedules/create` | `/schedules/create`;
            params?: Router.UnknownInputParams;
          }
        | { pathname: `${'/(app)'}/schedules` | `/schedules`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/settings` | `/settings`; params?: Router.UnknownInputParams }
        | {
            pathname: `${'/(app)'}/settings/memory` | `/settings/memory`;
            params?: Router.UnknownInputParams;
          }
        | { pathname: `${'/(auth)'}/login` | `/login`; params?: Router.UnknownInputParams }
        | {
            pathname: `${'/(app)'}/chat/[id]` | `/chat/[id]`;
            params: Router.UnknownInputParams & { id: string | number };
          };
      hrefOutputParams:
        | { pathname: Router.RelativePathString; params?: Router.UnknownOutputParams }
        | { pathname: Router.ExternalPathString; params?: Router.UnknownOutputParams }
        | { pathname: `/_sitemap`; params?: Router.UnknownOutputParams }
        | { pathname: `${'/(app)'}` | `/`; params?: Router.UnknownOutputParams }
        | { pathname: `${'/(app)'}/agents` | `/agents`; params?: Router.UnknownOutputParams }
        | { pathname: `${'/(app)'}/companion` | `/companion`; params?: Router.UnknownOutputParams }
        | { pathname: `${'/(app)'}/messaging` | `/messaging`; params?: Router.UnknownOutputParams }
        | {
            pathname: `${'/(app)'}/schedules/create` | `/schedules/create`;
            params?: Router.UnknownOutputParams;
          }
        | { pathname: `${'/(app)'}/schedules` | `/schedules`; params?: Router.UnknownOutputParams }
        | { pathname: `${'/(app)'}/settings` | `/settings`; params?: Router.UnknownOutputParams }
        | {
            pathname: `${'/(app)'}/settings/memory` | `/settings/memory`;
            params?: Router.UnknownOutputParams;
          }
        | { pathname: `${'/(auth)'}/login` | `/login`; params?: Router.UnknownOutputParams }
        | {
            pathname: `${'/(app)'}/chat/[id]` | `/chat/[id]`;
            params: Router.UnknownOutputParams & { id: string };
          };
      href:
        | Router.RelativePathString
        | Router.ExternalPathString
        | `/_sitemap${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}${`?${string}` | `#${string}` | ''}`
        | `/${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/agents${`?${string}` | `#${string}` | ''}`
        | `/agents${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/companion${`?${string}` | `#${string}` | ''}`
        | `/companion${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/messaging${`?${string}` | `#${string}` | ''}`
        | `/messaging${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/schedules/create${`?${string}` | `#${string}` | ''}`
        | `/schedules/create${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/schedules${`?${string}` | `#${string}` | ''}`
        | `/schedules${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/settings${`?${string}` | `#${string}` | ''}`
        | `/settings${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/settings/memory${`?${string}` | `#${string}` | ''}`
        | `/settings/memory${`?${string}` | `#${string}` | ''}`
        | `${'/(auth)'}/login${`?${string}` | `#${string}` | ''}`
        | `/login${`?${string}` | `#${string}` | ''}`
        | { pathname: Router.RelativePathString; params?: Router.UnknownInputParams }
        | { pathname: Router.ExternalPathString; params?: Router.UnknownInputParams }
        | { pathname: `/_sitemap`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}` | `/`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/agents` | `/agents`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/companion` | `/companion`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/messaging` | `/messaging`; params?: Router.UnknownInputParams }
        | {
            pathname: `${'/(app)'}/schedules/create` | `/schedules/create`;
            params?: Router.UnknownInputParams;
          }
        | { pathname: `${'/(app)'}/schedules` | `/schedules`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/settings` | `/settings`; params?: Router.UnknownInputParams }
        | {
            pathname: `${'/(app)'}/settings/memory` | `/settings/memory`;
            params?: Router.UnknownInputParams;
          }
        | { pathname: `${'/(auth)'}/login` | `/login`; params?: Router.UnknownInputParams }
        | `${'/(app)'}/chat/${Router.SingleRoutePart<T>}`
        | `/chat/${Router.SingleRoutePart<T>}`
        | {
            pathname: `${'/(app)'}/chat/[id]` | `/chat/[id]`;
            params: Router.UnknownInputParams & { id: string | number };
          };
    }
  }
}
