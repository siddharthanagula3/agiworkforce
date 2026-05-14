import { redirect } from 'next/navigation';

// /features/plugins — redirected to /desktop, where MCP plugins live.
export default function FeaturesPluginsPage(): never {
  redirect('/desktop');
}
