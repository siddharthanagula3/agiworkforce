-- =============================================================================
-- Migration 0269: retain audit-stream signing keys as tenant-bound ciphertext
--
-- Why    : 0143 stored only SHA-256(secret), but HMAC delivery needs the same
--          key the receiver was shown. Signing with the hash produces a value
--          the receiver cannot verify with that secret.
--
-- Shape  : additive nullable ciphertext. Existing destinations cannot be
--          recovered from a one-way hash and must rotate once. New saves seal
--          the key under the workspace key ring, bound to the organization and
--          this purpose in the authenticated encryption context.
--
-- Depends: 0143_audit_event_streaming.sql
-- =============================================================================

begin;

alter table public.organization_audit_destinations
  add column if not exists secret_ciphertext text;

comment on column public.organization_audit_destinations.secret_ciphertext is
  'Versioned authenticated ciphertext of the audit-stream HMAC key, bound to the organization. Existing null rows must rotate their destination secret before delivery can resume.';

comment on column public.organization_audit_destinations.secret_hash is
  'SHA-256 fingerprint of the signing secret. It identifies the one-time secret but is never used as the HMAC key.';

commit;
