import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Plus, Save, Shield, Trash2, Users } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';

const PERMISSIONS = [
  { id: 'manage_exams', label: 'إدارة الاختبارات', detail: 'إنشاء الاختبارات وتعديلها وتفعيلها وأرشفتها.' },
  { id: 'manage_students', label: 'إدارة الطلاب', detail: 'استيراد سجل الطلاب وتعديله.' },
  { id: 'view_grades', label: 'عرض الدرجات', detail: 'مشاهدة النتائج وتصدير الدرجات والشهادات.' },
];

const EMPTY_PASSWORD = { password: '', confirm: '' };
const EMPTY_NEW_USER = { displayName: '', password: '', permissions: ['manage_students'] };

async function invokeSettings(action, values = {}) {
  const { data, error } = await supabase.functions.invoke('manage-teacher-settings', { body: { action, ...values } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'تعذر حفظ الإعدادات.');
  return data;
}

function PermissionChoices({ selected, onChange, disabled = false }) {
  const toggle = (permission) => onChange(selected.includes(permission)
    ? selected.filter((item) => item !== permission)
    : [...selected, permission]);

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {PERMISSIONS.map((permission) => (
        <label key={permission.id} className={`flex gap-2 rounded-xl border p-3 ${disabled ? 'opacity-70' : 'cursor-pointer'}`} style={{ borderColor: 'var(--mol-line-strong)' }}>
          <input type="checkbox" checked={selected.includes(permission.id)} disabled={disabled} onChange={() => toggle(permission.id)} />
          <span><span className="block text-sm font-extrabold">{permission.label}</span><span className="mt-1 block text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>{permission.detail}</span></span>
        </label>
      ))}
    </div>
  );
}

function PasswordSection({ title, description, action, label }) {
  const [values, setValues] = useState(EMPTY_PASSWORD);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');
    if (values.password.length < 8 || values.password.length > 128) {
      setError('استخدم كلمة مرور من 8 إلى 128 حرفاً.');
      return;
    }
    if (values.password !== values.confirm) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    setSaving(true);
    try {
      await invokeSettings(action, { password: values.password });
      setValues(EMPTY_PASSWORD);
      setMessage(`تم تحديث ${label} بنجاح.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div><h3 className="font-extrabold">{title}</h3><p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>{description}</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="mol-label">كلمة المرور الجديدة<input className="mol-input mt-1" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={values.password} onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))} required /></label>
        <label className="mol-label">تأكيد كلمة المرور<input className="mol-input mt-1" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={values.confirm} onChange={(event) => setValues((current) => ({ ...current, confirm: event.target.value }))} required /></label>
      </div>
      {message && <p role="status" className="text-sm font-extrabold" style={{ color: 'var(--mol-green)' }}>{message}</p>}
      {error && <p role="alert" className="text-sm font-extrabold" style={{ color: 'var(--mol-red)' }}>{error}</p>}
      <button type="submit" className="mol-btn mol-btn-primary inline-flex items-center gap-2 px-4 py-2.5" disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} حفظ كلمة المرور</button>
    </form>
  );
}

export default function AdminSettingsPage() {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [newUser, setNewUser] = useState(EMPTY_NEW_USER);
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState('');
  const [createError, setCreateError] = useState('');
  const [savingUserId, setSavingUserId] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const [resetPasswords, setResetPasswords] = useState({});

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setUsersError('');
    try {
      const data = await invokeSettings('list-users');
      setUsers(data.users || []);
    } catch (error) {
      setUsersError(error.message);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const createUser = async (event) => {
    event.preventDefault();
    setCreating(true);
    setCreateMessage('');
    setCreateError('');
    try {
      await invokeSettings('create-user', newUser);
      setNewUser(EMPTY_NEW_USER);
      setCreateMessage('تم إنشاء حساب المدير. شارك كلمة المرور الأولية معه بطريقة آمنة.');
      await loadUsers();
    } catch (error) {
      setCreateError(error.message);
    } finally {
      setCreating(false);
    }
  };

  const savePermissions = async (user) => {
    setSavingUserId(user.id);
    setUserMessage('');
    try {
      await invokeSettings('update-user-permissions', { userId: user.id, permissions: user.permissions });
      setUserMessage(`تم تحديث صلاحيات ${user.displayName}.`);
    } catch (error) {
      setUsersError(error.message);
      await loadUsers();
    } finally {
      setSavingUserId('');
    }
  };

  const setDelegatePassword = async (user) => {
    const password = resetPasswords[user.id] || '';
    if (password.length < 12 || password.length > 128) {
      setUsersError('استخدم كلمة مرور فريدة من 12 حرفاً على الأقل.');
      return;
    }
    setSavingUserId(user.id);
    setUsersError('');
    setUserMessage('');
    try {
      await invokeSettings('set-delegate-password', { userId: user.id, password });
      setResetPasswords((current) => ({ ...current, [user.id]: '' }));
      setUserMessage(`تم تحديث كلمة مرور ${user.displayName}.`);
    } catch (error) {
      setUsersError(error.message);
    } finally {
      setSavingUserId('');
    }
  };

  const removeUser = async (user) => {
    if (!window.confirm(`حذف حساب ${user.displayName} وإلغاء صلاحياته نهائياً؟`)) return;
    setSavingUserId(user.id);
    setUsersError('');
    setUserMessage('');
    try {
      await invokeSettings('remove-user', { userId: user.id });
      setUserMessage(`تم حذف حساب ${user.displayName}.`);
      await loadUsers();
    } catch (error) {
      setUsersError(error.message);
    } finally {
      setSavingUserId('');
    }
  };

  return (
    <div className="space-y-5">
      <header className="mol-card flex items-center gap-4 p-5 md:p-6">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl" style={{ background: 'var(--mol-cobalt-soft)', color: 'var(--mol-cobalt)' }}><Shield size={23} /></span>
        <div><h2 className="text-2xl font-extrabold">إعدادات المنصة</h2><p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>كلمات مرور منفصلة وإدارة صلاحيات حسابات المعلمين.</p></div>
      </header>

      <section className="mol-card space-y-5 p-5 md:p-6">
        <div className="flex items-center gap-3"><KeyRound size={20} style={{ color: 'var(--mol-cobalt)' }} /><h2 className="text-lg font-extrabold">كلمات المرور</h2></div>
        <PasswordSection title="كلمة مرور دخول المالك" label="كلمة مرور دخول المالك" action="change-admin-password" description="تستخدم لدخول حساب المالك إلى لوحة الإدارة." />
        <hr style={{ borderColor: 'var(--mol-line-strong)' }} />
        <PasswordSection title="كلمة مرور إعادة دخول الطالب" label="كلمة مرور إعادة الدخول" action="change-reentry-password" description="تستخدم لفتح محاولة الطالب المقفلة. تغييرها لا يغير كلمة مرور دخول المالك." />
      </section>

      <section className="mol-card space-y-5 p-5 md:p-6">
        <div className="flex items-center gap-3"><Users size={20} style={{ color: 'var(--mol-cobalt)' }} /><div><h2 className="text-lg font-extrabold">حسابات المديرين والصلاحيات</h2><p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>يدخل كل مدير بكلمة مروره فقط، من دون بريد إلكتروني.</p></div></div>
        {usersError && <p role="alert" className="rounded-lg p-3 text-sm font-bold" style={{ background: 'var(--mol-red-soft)', color: 'var(--mol-red)' }}>{usersError}</p>}
        {userMessage && <p role="status" className="text-sm font-extrabold" style={{ color: 'var(--mol-green)' }}>{userMessage}</p>}
        {loadingUsers ? <p role="status" className="flex items-center gap-2 font-bold"><Loader2 size={16} className="animate-spin" /> جارٍ تحميل الحسابات…</p> : users.length === 0 ? <p className="text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>لا توجد حسابات مديرين.</p> : (
          <div className="space-y-3">
            {users.map((user) => (
              <article key={user.id} className="space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--mol-line-strong)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-extrabold">{user.displayName}</p><p className="text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>{user.isOwner ? 'مالك المنصة · جميع الصلاحيات' : 'مدير مفوض · تسجيل بكلمة مرور فقط'}</p></div>{!user.isOwner && <div className="flex gap-2"><button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-1.5 px-3 py-2" disabled={savingUserId === user.id} onClick={() => savePermissions(user)}>{savingUserId === user.id ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} حفظ الصلاحيات</button><button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-1.5 px-3 py-2" disabled={savingUserId === user.id} onClick={() => removeUser(user)}><Trash2 size={15} style={{ color: 'var(--mol-red)' }} /> حذف</button></div>}</div>
                <PermissionChoices selected={user.permissions || []} disabled={user.isOwner} onChange={(permissions) => setUsers((current) => current.map((item) => item.id === user.id ? { ...item, permissions } : item))} />
                {!user.isOwner && <div className="flex flex-wrap gap-2"><input className="mol-input min-w-52 flex-1" type="password" autoComplete="new-password" minLength={12} maxLength={128} aria-label={`كلمة المرور الجديدة للمدير ${user.displayName}`} placeholder="كلمة مرور جديدة (12 حرفاً على الأقل)" value={resetPasswords[user.id] || ''} onChange={(event) => setResetPasswords((current) => ({ ...current, [user.id]: event.target.value }))} /><button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-1.5 px-3 py-2" disabled={savingUserId === user.id || (resetPasswords[user.id] || '').length < 12} onClick={() => setDelegatePassword(user)}>{savingUserId === user.id ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} تعيين كلمة المرور</button></div>}
              </article>
            ))}
          </div>
        )}
        <hr style={{ borderColor: 'var(--mol-line-strong)' }} />
        <form className="space-y-4" onSubmit={createUser}>
          <h3 className="font-extrabold">إضافة مدير</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="mol-label">اسم المدير<input className="mol-input mt-1" type="text" autoComplete="off" maxLength={80} value={newUser.displayName} onChange={(event) => setNewUser((current) => ({ ...current, displayName: event.target.value }))} required /></label>
            <label className="mol-label">كلمة المرور الأولية<input className="mol-input mt-1" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newUser.password} onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))} required /><span className="mt-1 block text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>12 حرفاً على الأقل.</span></label>
          </div>
          <PermissionChoices selected={newUser.permissions} onChange={(permissions) => setNewUser((current) => ({ ...current, permissions }))} />
          {createMessage && <p role="status" className="text-sm font-extrabold" style={{ color: 'var(--mol-green)' }}>{createMessage}</p>}
          {createError && <p role="alert" className="text-sm font-extrabold" style={{ color: 'var(--mol-red)' }}>{createError}</p>}
          <button type="submit" className="mol-btn mol-btn-primary inline-flex items-center gap-2 px-4 py-2.5" disabled={creating || newUser.permissions.length === 0}>{creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} إضافة الحساب</button>
        </form>
      </section>
    </div>
  );
}
