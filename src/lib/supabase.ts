import { createClient } from '@supabase/supabase-js';

// Publishable key, client-side by design. Writes are gated by RLS.
export const SUPABASE_URL = 'https://nqcbfsnscqoaznypovyx.supabase.co';

export const supabase = createClient(SUPABASE_URL, 'sb_publishable_a_5S14K41Okv1vsNTNZn3A_QxQ601vA');
