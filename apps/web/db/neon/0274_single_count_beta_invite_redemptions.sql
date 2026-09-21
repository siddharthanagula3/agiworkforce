begin;

drop trigger if exists beta_redemptions_after_insert on public.beta_redemptions;

commit;
