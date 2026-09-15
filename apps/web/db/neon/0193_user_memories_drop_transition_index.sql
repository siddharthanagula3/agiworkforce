-- 0193 : drop the global unique index on user_memories.id that 0189 kept for the cutover.
--
-- NOT YET APPLIED : run only after the deployment that names (user_id, id) as
-- the memory conflict target is live; the earlier deployment needs this index.
--
-- 0189 made a memory row's identity per-user and kept a unique index on `id`
-- alone so the deployment that still named `(id)` as its conflict target kept
-- writing during the cutover. With that deployment gone the index is the
-- global-uniqueness hole 0189 closed, reopened: one account could again occupy
-- an id another account will use. This drops it.

drop index if exists public.ux_user_memories_id_transition;
