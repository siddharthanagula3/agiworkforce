-- Down for 0158: restore the em-dash descriptions.
--
-- NOT YET APPLIED: draft only, pending explicit approval before running.

begin;

update public.plugin_registry_entries
   set description =
         'Review pull requests, debug systematically, and check frontend design quality '
         || E'— a bundle of engineering skills for day-to-day development work.',
       updated_at = now()
 where id = 'engineering-pack';

update public.plugin_registry_entries
   set description =
         'Draft documents, build presentations, and research with citations '
         || E'— a bundle of writing and research skills for polished deliverables.',
       updated_at = now()
 where id = 'writing-pack';

update public.plugin_registry_entries
   set description =
         'Analyze datasets and turn the results into clear documents '
         || E'— a bundle of data and reporting skills.',
       updated_at = now()
 where id = 'data-pack';

delete from public.schema_migrations
 where filename = '0158_plugin_pack_description_no_em_dash.sql';

commit;
