import { redirect } from 'next/navigation';

export default function ChatArtifactsRoute(): never {
  redirect('/chat/library?surface=artifact');
}
