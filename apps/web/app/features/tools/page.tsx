import { redirect } from 'next/navigation';

// /features/tools — redirected to /desktop, where computer-use tools live.
export default function FeaturesToolsPage(): never {
  redirect('/desktop');
}
