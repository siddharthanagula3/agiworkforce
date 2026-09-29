-- =============================================================================
-- Migration 0344: return a phone GitHub install over a verified App Link
--
-- Why    : 0343 handed the user authorization response back on the custom
--          agiworkforce:// scheme. On Android any installed app can register
--          that scheme, so an interceptor on a phished victim's phone could
--          catch the response of a flow an attacker started. PKCE does not help
--          there, because the attacker started the flow and holds its verifier.
--
-- Shape  : github_install_authorizations gains return_target. An install the
--          Android app starts returns through https://agiworkforce.com/github/
--          installed, which only the app whose signature assetlinks.json names
--          can open. iOS keeps the custom scheme inside ASWebAuthenticationSession,
--          which delivers the callback only to the session that asked for it.
-- =============================================================================

begin;

alter table public.github_install_authorizations
  add column if not exists return_target text not null default 'app_scheme'
    check (return_target = any (array['app_scheme', 'app_link']));

commit;
