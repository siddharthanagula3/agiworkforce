-- Reversal of 0376 restores the 0020 body of validate_and_redeem_invite_code,
-- including its ambiguous invite_id reference: every redemption fails again.

begin;

create or replace function public.validate_and_redeem_invite_code(p_user_id text, p_code text, p_surface text, p_source text)
returns table(valid boolean, invite_id uuid, error text)
language plpgsql
as $$
declare
  v_invite public.beta_invites%rowtype;
  v_already_used boolean := false;
begin
  -- Lock the invite row to serialize concurrent redemptions.
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
    select 1 from public.beta_redemptions
    where invite_id = v_invite.id
      and user_id = p_user_id
  ) into v_already_used;

  if v_already_used then
    return query select false, v_invite.id, 'already_redeemed_by_user'::text;
    return;
  end if;

  insert into public.beta_redemptions (invite_id, user_id, surface, source)
  values (v_invite.id, p_user_id, p_surface, p_source);

  -- Increment use count (trigger beta_invites_increment_uses may also exist;
  -- this UPDATE is a safety belt in case the trigger is absent on Neon).
  update public.beta_invites
  set current_uses = current_uses + 1
  where id = v_invite.id;

  return query select true, v_invite.id, null::text;
end;
$$;


delete from public.schema_migrations where filename = '0376_invite_code_redemption_unambiguous.sql';

commit;
