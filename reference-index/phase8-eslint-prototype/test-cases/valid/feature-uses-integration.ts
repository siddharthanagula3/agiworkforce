// FILE: apps/mobile/src/features/waitlist/service.ts
// PASSES: features/ → integrations/ is allowed (features call integrations,
// not the other way around).

import { supabase } from '@/src/integrations/supabase/client';

export async function joinWaitlist(email: string) {
  return supabase.from('waitlist').insert({ email });
}
