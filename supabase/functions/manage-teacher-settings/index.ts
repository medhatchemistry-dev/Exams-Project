import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, isAllowedOrigin, parseConfiguredOrigins } from '../_shared/cors.js';

const ALLOWED_PERMISSIONS = new Set(['manage_exams', 'manage_students', 'view_grades']);

function validPermissions(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((permission) =>
    typeof permission === 'string' && ALLOWED_PERMISSIONS.has(permission)
  );
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  const allowedOrigins = parseConfiguredOrigins(Deno.env.get('APP_ALLOWED_ORIGINS'));
  const headers = corsHeaders(origin, allowedOrigins);
  if (!isAllowedOrigin(origin, allowedOrigins)) return Response.json({ error: 'Forbidden origin' }, { status: 403, headers });
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });

  try {
    const authorization = request.headers.get('authorization') || '';
    const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return Response.json({ error: 'Owner sign-in is required' }, { status: 401, headers });

    const url = Deno.env.get('SUPABASE_URL');
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    const serviceKey = secretKeys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) throw new Error('Server configuration is incomplete');
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
    if (authError || !authData.user) return Response.json({ error: 'Owner sign-in is required' }, { status: 401, headers });
    const { data: owner, error: ownerError } = await admin.from('teacher_roles')
      .select('is_owner').eq('user_id', authData.user.id).maybeSingle();
    if (ownerError) throw ownerError;
    if (!owner?.is_owner) return Response.json({ error: 'Owner permission is required' }, { status: 403, headers });

    const body = await request.json();
    if (body?.action === 'list-users') {
      const [{ data: roleData, error: rolesError }, { data: authUsers, error: usersError }] = await Promise.all([
        admin.from('teacher_roles').select('user_id, display_name, is_owner, permissions, created_at').order('created_at'),
        admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ]);
      if (rolesError) throw rolesError;
      if (usersError) throw usersError;
      const usersById = new Map(authUsers.users.map((user) => [user.id, user]));
      return Response.json({ users: (roleData ?? []).flatMap((role) => {
        const user = usersById.get(role.user_id);
        return user ? [{ id: role.user_id, displayName: role.display_name, isOwner: role.is_owner, permissions: role.permissions ?? [], createdAt: role.created_at }] : [];
      }) }, { headers });
    }

    if (body?.action === 'create-user') {
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
      const password = body.password;
      if (displayName.length < 1 || displayName.length > 80
        || typeof password !== 'string' || password.length < 12 || password.length > 128
        || !validPermissions(body.permissions) || body.permissions.length === 0) {
        return Response.json({ error: 'Enter a name, a unique 12-character password, and at least one permission' }, { status: 400, headers });
      }
      const email = `admin-${crypto.randomUUID()}@admins.invalid`;
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (createError || !created.user) {
        return Response.json({ error: 'Could not create that administrator account' }, { status: 409, headers });
      }
      const { error: roleError } = await admin.from('teacher_roles').insert({
        user_id: created.user.id,
        display_name: displayName,
        is_owner: false,
        permissions: [...new Set(body.permissions)],
      });
      if (roleError) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw roleError;
      }
      const { error: delegatePasswordError } = await admin.rpc('set_teacher_delegate_password', {
        target_user_id: created.user.id,
        candidate: password,
      });
      if (delegatePasswordError) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw delegatePasswordError;
      }
      return Response.json({ created: true }, { headers });
    }

    if (body?.action === 'set-delegate-password') {
      const targetId = typeof body.userId === 'string' ? body.userId : '';
      const password = body.password;
      if (!/^[0-9a-f-]{36}$/i.test(targetId) || targetId === authData.user.id
        || typeof password !== 'string' || password.length < 12 || password.length > 128) {
        return Response.json({ error: 'Choose a delegated administrator and a 12-character password' }, { status: 400, headers });
      }
      const { data: target, error: targetError } = await admin.from('teacher_roles')
        .select('user_id, is_owner').eq('user_id', targetId).maybeSingle();
      if (targetError) throw targetError;
      if (!target || target.is_owner) return Response.json({ error: 'Owner password cannot be changed here' }, { status: 409, headers });
      const { error: updateAuthError } = await admin.auth.admin.updateUserById(targetId, { password });
      if (updateAuthError) throw updateAuthError;
      const { error: passwordError } = await admin.rpc('set_teacher_delegate_password', {
        target_user_id: targetId,
        candidate: password,
      });
      if (passwordError) throw passwordError;
      return Response.json({ changed: true }, { headers });
    }

    if (body?.action === 'update-user-permissions') {
      const targetId = typeof body.userId === 'string' ? body.userId : '';
      if (!/^[0-9a-f-]{36}$/i.test(targetId) || targetId === authData.user.id
        || !validPermissions(body.permissions) || body.permissions.length === 0) {
        return Response.json({ error: 'Choose another administrator and at least one permission' }, { status: 400, headers });
      }
      const { data: target, error: targetError } = await admin.from('teacher_roles')
        .select('user_id, is_owner').eq('user_id', targetId).maybeSingle();
      if (targetError) throw targetError;
      if (!target || target.is_owner) return Response.json({ error: 'Owner access cannot be changed here' }, { status: 409, headers });
      const { error: updateError } = await admin.from('teacher_roles')
        .update({ permissions: [...new Set(body.permissions)] }).eq('user_id', targetId);
      if (updateError) throw updateError;
      return Response.json({ updated: true }, { headers });
    }

    if (body?.action === 'remove-user') {
      const targetId = typeof body.userId === 'string' ? body.userId : '';
      if (!/^[0-9a-f-]{36}$/i.test(targetId) || targetId === authData.user.id) {
        return Response.json({ error: 'Owner access cannot be removed here' }, { status: 400, headers });
      }
      const { data: target, error: targetError } = await admin.from('teacher_roles')
        .select('user_id, is_owner').eq('user_id', targetId).maybeSingle();
      if (targetError) throw targetError;
      if (!target || target.is_owner) return Response.json({ error: 'Owner access cannot be removed here' }, { status: 409, headers });
      const { error: roleDeleteError } = await admin.from('teacher_roles').delete().eq('user_id', targetId);
      if (roleDeleteError) throw roleDeleteError;
      const { error: userDeleteError } = await admin.auth.admin.deleteUser(targetId);
      if (userDeleteError) throw userDeleteError;
      return Response.json({ removed: true }, { headers });
    }

    if (body?.action === 'change-admin-password' || body?.action === 'change-reentry-password') {
      const password = body.password;
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return Response.json({ error: 'Password must contain between 8 and 128 characters' }, { status: 400, headers });
      }
      const rpc = body.action === 'change-admin-password'
        ? 'set_teacher_login_password'
        : 'set_exam_reentry_password';
      const { error: passwordError } = await admin.rpc(rpc, { candidate: password });
      if (passwordError) throw passwordError;
      return Response.json({ changed: true }, { headers });
    }

    return Response.json({ error: 'Unsupported settings action' }, { status: 400, headers });
  } catch (error) {
    console.error('Teacher settings request failed:', error);
    return Response.json({ error: 'Settings could not be saved' }, { status: 500, headers });
  }
});
