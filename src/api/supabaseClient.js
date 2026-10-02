import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Supabase environment variables are missing.');
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);

export async function hasTeacherRole(userId) {
  if (!userId) return false;

  const { data, error } = await supabase
    .from('teacher_roles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}
