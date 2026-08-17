-- 0126 — plan allowance and purchased balance are non-transferable.
--
-- 0111 split purchased value out of the shared cents ledger
-- (top_up_allocated_cents), gave it a 12-month expiry at renewal, and made a
-- refund retire it. 0118/0119 fixed the consumption order so purchased balance
-- is only reachable once the included plan allowance is spent. The remaining
-- attribute of the balance was never stated or enforced: whether it can move to
-- another account.
--
-- It cannot. Both balances are entitlements of one paying identity — a
-- purchased balance is refundable to the card that bought it and revocable on
-- dispute, and neither is possible once the value sits under a different
-- user_id. No application path reassigns ownership today; these triggers make
-- that a property of the schema instead of a property of the current code, so a
-- future "merge these two accounts" or "move credits to the org owner" change
-- has to be a deliberate migration rather than an UPDATE that silently detaches
-- money from the payer and from its refund path.

begin;

create or replace function public.token_credits_forbid_owner_transfer()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception
      'token_credits.user_id is immutable: plan allowance and purchased balance are non-transferable'
      using errcode = 'restrict_violation',
            hint = 'Refund or revoke the balance on the paying account and grant it on the target account, so the ledger keeps a payer for every cent.';
  end if;

  return new;
end;
$$;

comment on function public.token_credits_forbid_owner_transfer() is
  'Non-transferability guard: a credit account cannot change owner, because refund and dispute revocation both address the paying identity.';

drop trigger if exists token_credits_owner_immutable on public.token_credits;
create trigger token_credits_owner_immutable
  before update on public.token_credits
  for each row
  execute function public.token_credits_forbid_owner_transfer();

create or replace function public.credit_transactions_forbid_owner_transfer()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.credit_account_id is distinct from old.credit_account_id then
    raise exception
      'credit_transactions ownership is immutable: a ledger entry cannot be moved to another account'
      using errcode = 'restrict_violation',
            hint = 'Append a compensating transaction instead of re-pointing an existing one.';
  end if;

  return new;
end;
$$;

comment on function public.credit_transactions_forbid_owner_transfer() is
  'Non-transferability guard for the credit ledger: purchase, refund and settlement rows stay attached to the account that produced them.';

drop trigger if exists credit_transactions_owner_immutable on public.credit_transactions;
create trigger credit_transactions_owner_immutable
  before update on public.credit_transactions
  for each row
  execute function public.credit_transactions_forbid_owner_transfer();

comment on column public.token_credits.credits_allocated_cents is
  'Total spendable cents for the period: included plan allowance plus any carried purchased balance. Plan allowance expires at period end, is not refundable, and is non-transferable. Included allowance is consumed before purchased balance.';

comment on column public.token_credits.top_up_allocated_cents is
  'Purchased-credit portion of credits_allocated_cents. Unused purchases carry across periods, purchases older than 12 months are excluded at renewal, a Stripe refund retires the purchase through handle_top_up_refund, a dispute revokes the remaining balance, and the balance is non-transferable between accounts.';

commit;
