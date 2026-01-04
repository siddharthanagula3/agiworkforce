-- Create function to add credits (for top-ups and purchases)
-- This function adds credits to a user's account and records the transaction

CREATE OR REPLACE FUNCTION public.add_credits(
  p_user_id uuid,
  p_account_id uuid,
  p_amount_cents integer,
  p_description text,
  p_transaction_type text DEFAULT 'purchase'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate inputs
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be positive';
  END IF;

  IF p_transaction_type NOT IN ('purchase', 'adjustment', 'refund', 'bonus') THEN
    RAISE EXCEPTION 'Invalid transaction type';
  END IF;

  -- Update the token_credits table
  UPDATE public.token_credits
  SET
    credits_allocated_cents = credits_allocated_cents + p_amount_cents,
    credits_remaining_cents = credits_remaining_cents + p_amount_cents,
    updated_at = now()
  WHERE id = p_account_id AND user_id = p_user_id;

  -- Verify the update succeeded
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit account not found for user';
  END IF;

  -- Record the transaction
  INSERT INTO public.credit_transactions (
    user_id,
    credit_account_id,
    amount_cents,
    transaction_type,
    description
  ) VALUES (
    p_user_id,
    p_account_id,
    p_amount_cents,
    p_transaction_type,
    p_description
  );

  -- Log the action
  RAISE NOTICE 'Added % credits to account % for user %', p_amount_cents, p_account_id, p_user_id;
END;
$$;

-- Grant execute permission to service_role (used by backend)
GRANT EXECUTE ON FUNCTION public.add_credits TO service_role;

-- Add comment for documentation
COMMENT ON FUNCTION public.add_credits IS 'Adds credits to a user account and records the transaction. Used for purchases, top-ups, adjustments, refunds, and bonuses.';
