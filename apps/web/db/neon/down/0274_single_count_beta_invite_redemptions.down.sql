begin;

create trigger beta_redemptions_after_insert
  after insert on public.beta_redemptions
  for each row execute function public.beta_invites_increment_uses();

delete from public.schema_migrations
 where filename = '0274_single_count_beta_invite_redemptions.sql';

commit;
