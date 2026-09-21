-- =============================================================================
-- Migration: drop the plain-text bearer columns on device_authorization_codes
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : device_authorization_codes.access_token and .refresh_token were
--          meant to hand a freshly approved device its credential. Nothing
--          does that any more: the approval routes and the link route write
--          NULL into both, and the poll route mints a renewable pair bound to
--          a session family and stores its hash in device_refresh_tokens. Two
--          unencrypted text columns shaped to hold bearer tokens, sitting on a
--          table an unauthenticated flow inserts into, are a place for the
--          next writer to put a secret in the clear.
--
-- Shape  : the columns go. The select in the poll route already ignores the
--          values it reads, and the credential a device receives is unchanged.
--
-- destructive: no data is lost. Every statement that has ever written these
--          columns writes NULL (the link route inserts NULL, both approval
--          routes set NULL, the poll route sets NULL on consumption), and the
--          only reader discards the value, so the columns hold nothing a
--          caller can observe.
--
-- Order  : this is a CONTRACT step and sorts last on purpose. The release before
--          this one still names both columns in its device routes, so apply it
--          only immediately before the release that stops naming them is deployed.
--
-- Depends: 0013 (device_authorization_codes), 0029 (its status contract)
-- =============================================================================

begin;

alter table public.device_authorization_codes
  drop column if exists access_token,
  drop column if exists refresh_token;

commit;
