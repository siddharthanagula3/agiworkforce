/** @vitest-environment jsdom */
import { beforeEach, expect, it, vi } from 'vitest';
import { upsertConversation, listConversations, getConversation } from '/Users/siddhartha/Desktop/agiworkforce/.worktrees/billing-e2e/apps/extension/src/features/background/conversation-history';
const store: Record<string, unknown> = {};
const chromeMock = {storage:{local:{
 get:vi.fn((keys: string|string[], callback:(value:Record<string,unknown>)=>void)=>callback(Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,store[key]])))),
 set:vi.fn((items:Record<string,unknown>,callback?:()=>void)=>{Object.assign(store,items);callback?.();}),
 remove:vi.fn((keys:string|string[],callback?:()=>void)=>{for(const key of Array.isArray(keys)?keys:[keys])delete store[key];callback?.();})
}},runtime:{lastError:undefined}};
(globalThis as unknown as Record<string,unknown>).chrome=chromeMock;
beforeEach(()=>{for(const key of Object.keys(store))delete store[key];vi.clearAllMocks();});
it('retains account-owned history when the same account signs in with a new Clerk session',async()=>{
 const previousOwner={accountId:'account-a',authIncarnation:'session-before-signout'};
 const nextOwner={accountId:'account-a',authIncarnation:'session-after-signin'};
 const now=Date.now();
 await upsertConversation(previousOwner,'retained-chat',[{role:'user',content:'Please retain my work',timestamp:now,runtime:'managed-cloud'}]);
 expect(await listConversations(previousOwner)).toHaveLength(1);
 expect(await getConversation(previousOwner,'retained-chat')).toBeDefined();
 expect(await listConversations({accountId:'different-account',authIncarnation:'different-session'})).toHaveLength(0);
 expect((store.agi_browser_conversations_v2 as {conversations:unknown[]}).conversations).toHaveLength(1);
 expect(await listConversations(nextOwner)).toHaveLength(1);
 expect(await getConversation(nextOwner,'retained-chat')).toBeDefined();
});
