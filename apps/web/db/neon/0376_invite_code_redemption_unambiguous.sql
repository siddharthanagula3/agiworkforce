-- =============================================================================
-- Migration 0376: redeem an invite code without an ambiguous column
--
-- Why    : validate_and_redeem_invite_code (0020) returns a table with an
--          invite_id column, so inside its body the already-redeemed check
--          `where invite_id = v_invite.id` names both that output column and
--          beta_redemptions.invite_id. Postgres refuses it with "column
--          reference invite_id is ambiguous", and every redemption through
--          /api/waitlist/access failed with a 500 before a row was written.
--
-- Shape  : the function is replaced with the same body, the check qualified
--          by a table alias. Signature, grants and behaviour are unchanged.
-- =============================================================================

begin;

create or replace function public.validate_and_redeem_invite_code(
  p_user_id text,
  p_code text,
  p_surface text,
  p_source text
)
returns table(valid boolean, invite_id uuid, error text)
language plpgsql
as $$
declare
  v_invite public.beta_invites%rowtype;
  v_already_used boolean := false;
begin
  select * into v_invite
  from public.beta_invites
  where lower(code) = lower(p_code)
    and is_active = true
  for update;

  if not found then
    return query select false, null::uuid, 'invalid_code'::text;
    return;
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return query select false, v_invite.id, 'expired'::text;
    return;
  end if;

  if v_invite.current_uses >= v_invite.max_uses then
    return query select false, v_invite.id, 'fully_redeemed'::text;
    return;
  end if;

  select exists(
    select 1 from public.beta_redemptions redemption
    where redemption.invite_id = v_invite.id
      and redemption.user_id = p_user_id
  ) into v_already_used;

  if v_already_used then
    return query select false, v_invite.id, 'already_redeemed_by_user'::text;
    return;
  end if;

  insert into public.beta_redemptions (invite_id, user_id, surface, source)
  values (v_invite.id, p_user_id, p_surface, p_source);

  update public.beta_invites
  set current_uses = current_uses + 1
  where id = v_invite.id;

  return query select true, v_invite.id, null::text;
end;
$$;

commit;
