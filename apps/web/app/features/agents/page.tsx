import { redirect } from 'next/navigation';

// /features/agents — redirected to /desktop, where parallel agent execution lives.
export default function FeaturesAgentsPage(): never {
  redirect('/desktop');
}
