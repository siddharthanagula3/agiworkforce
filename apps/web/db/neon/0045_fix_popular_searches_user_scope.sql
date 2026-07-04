-- 0045 — Fix critical privacy leak: popular/"trending" searches exposed raw
-- unredacted query text from EVERY user to EVERY other user.
--
-- ROOT CAUSE:
--   public.get_popular_searches(p_limit, p_days) (defined in 0020_functions.sql)
--   aggregated public.search_history across ALL users with no user scoping,
--   and apps/web/app/api/search/route.ts (type=popular) called it with only
--   (limit, days) — so any authenticated user's "Trending Searches" list
--   surfaced other users' literal search queries (which can contain names,
--   emails, project codenames, etc).
--
-- FIX:
--   Replace get_popular_searches with a version that requires p_user_id and
--   scopes the aggregation to that user's own search_history rows only,
--   matching the pattern already used by get_recent_searches /
--   get_search_suggestions / clear_search_history in 0020_functions.sql.
--   The old 2-arg (limit, days) overload is dropped so it can no longer be
--   called accidentally with unscoped semantics.
--
--   Route-layer fix (apps/web/app/api/search/route.ts) now passes the
--   server-verified Clerk userId (from getClerkAuthUser, never client input)
--   as the first argument.

drop function if exists public.get_popular_searches(integer, integer);

create or replace function public.get_popular_searches(
  p_user_id text,
  p_limit integer default 10,
  p_days integer default 7
)
returns table(query text, search_count bigint, avg_results numeric)
language plpgsql
stable
as $$
begin
  return query
    select sh.query,
           count(*)::bigint as search_count,
           avg(sh.result_count)::numeric as avg_results
    from public.search_history sh
    where sh.user_id = p_user_id
      and sh.created_at >= now() - (p_days || ' days')::interval
    group by sh.query
    order by search_count desc
    limit p_limit;
end;
$$;
