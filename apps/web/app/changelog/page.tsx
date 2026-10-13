import { RELEASE_NOTES_METADATA } from '../release-notes/release-notes-metadata';
import { ReleaseNotesPage } from '../release-notes/ReleaseNotesPage';

export const metadata = RELEASE_NOTES_METADATA;

export default function ChangelogPage() {
  return <ReleaseNotesPage titleId="agi-changelog-title" />;
}
