-- =============================================================================
-- Migration 0312: a public content notice can report impersonation
--
-- Why    : /copyright/report took copyright and trademark notices only, so a
--          person impersonated by a shared conversation or published artifact
--          had no way to report it and receive a reference.
--
-- Shape  : copyright_notices.notice_type records which claim the reporter
--          made: 'copyright', 'trademark' or 'impersonation'. Rows written
--          before this migration were copyright or trademark notices without
--          a distinction and read as 'copyright'.
--
-- Depends: 0122 (public.copyright_notices)
-- =============================================================================

begin;

alter table public.copyright_notices
  add column if not exists notice_type text not null default 'copyright';

alter table public.copyright_notices
  drop constraint if exists copyright_notices_notice_type_check,
  add constraint copyright_notices_notice_type_check
    check (notice_type in ('copyright', 'trademark', 'impersonation'));

comment on column public.copyright_notices.notice_type is
  'The claim the reporter made: copyright, trademark or impersonation. Rows before 0312 read as copyright.';

commit;
