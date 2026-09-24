begin;

alter table public.web_conversations
  drop column selected_route_id;

delete from public.schema_migrations
 where filename = '0293_conversation_provider_route_pin.sql';

commit;
