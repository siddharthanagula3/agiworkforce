-- =============================================================================
-- Migration 0341: per-device push preferences and the chat a share came from
--
-- Why    : a phone chose which notices it wanted and when, and sent that with
--          its push registration, but the server had nowhere to keep it. A
--          push arriving while the app was closed is shown by the OS before any
--          app code runs, so a category turned off on the phone still rang.
--          Separately, a shared link kept working after its chat was deleted,
--          because nothing tied the share to the conversation it copied.
--
-- Shape  : mobile_devices gains push_preferences, the device's own delivery
--          choices, which the sender reads before it hands a notice to Expo.
--          Null means the device has not said, and it keeps receiving
--          everything. shared_sessions gains conversation_id, set when a link
--          is created from a chat, so deleting the chat revokes its links.
--          Existing links are matched to their chat where the first shared
--          message is exactly one stored message of one of the owner's chats;
--          the rest stay unlinked.
-- =============================================================================

begin;

alter table public.mobile_devices
  add column if not exists push_preferences jsonb;

alter table public.shared_sessions
  add column if not exists conversation_id uuid;

create index if not exists idx_shared_sessions_conversation_id
  on public.shared_sessions (conversation_id)
  where conversation_id is not null;

with first_shared_message as (
  select share.id as share_id,
         share.owner_id,
         share.messages -> 0 ->> 'content' as content,
         share.messages -> 0 ->> 'created_at' as created_at
    from public.shared_sessions share
   where share.conversation_id is null
     and jsonb_typeof(share.messages) = 'array'
     and jsonb_array_length(share.messages) > 0
),
matched as (
  select first_shared_message.share_id,
         min(message.conversation_id::text)::uuid as conversation_id
    from first_shared_message
    join public.web_messages message
      on message.content = first_shared_message.content
     and to_char(message.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
         = first_shared_message.created_at
    join public.web_conversations conversation
      on conversation.id = message.conversation_id
     and conversation.user_id = first_shared_message.owner_id
   group by first_shared_message.share_id
  having count(distinct message.conversation_id) = 1
)
update public.shared_sessions share
   set conversation_id = matched.conversation_id
  from matched
 where share.id = matched.share_id;

commit;
