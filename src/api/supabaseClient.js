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
    .select('user_id, is_owner, permissions')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data && (data.is_owner || data.permissions?.length));
}

export async function hasTeacherPermission(userId, permission) {
  if (!userId || !permission) return false;
  const { data, error } = await supabase.from('teacher_roles')
    .select('is_owner, permissions').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return Boolean(data?.is_owner || data?.permissions?.includes(permission));
}

export async function getTeacherAccess(userId) {
  if (!userId) return { isOwner: false, permissions: [] };
  const { data, error } = await supabase.from('teacher_roles')
    .select('is_owner, permissions').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return {
    isOwner: Boolean(data?.is_owner),
    permissions: Array.isArray(data?.permissions) ? data.permissions : [],
  };
}
