import { RELEASE_NOTES_METADATA } from './release-notes-metadata';
import { ReleaseNotesPage } from './ReleaseNotesPage';

export const metadata = RELEASE_NOTES_METADATA;

export default function Page() {
  return <ReleaseNotesPage titleId="agi-release-notes-title" />;
}
