import { redirect } from 'next/navigation';

export default async function SignUpAlias({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') qs.set(key, value);
    else if (Array.isArray(value) && value[0] != null) qs.set(key, value[0]);
  }
  const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
  redirect(`/signup${suffix}`);
}
