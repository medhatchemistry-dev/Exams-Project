import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Check, Copy, KeyRound, Loader2, Power, RefreshCw } from 'lucide-react';

function createCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 10).toUpperCase();
}

export default function ExamAccessPanel() {
  const [activeCode, setActiveCode] = useState(null);
  const [expiryHours, setExpiryHours] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const loadCode = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('exam_access_codes')
        .select('id, code, expires_at, created_at')
        .eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (queryError) throw queryError;
      setActiveCode(data);
    } catch (queryError) {
      console.error('Exam code load failed:', queryError);
      setError('تعذر تحميل رمز الاختبار. تأكد من تطبيق تحديث قاعدة البيانات.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCode(); }, [loadCode]);

  const generate = async () => {
    setSaving(true);
    setError('');
    try {
      const { error: disableError } = await supabase
        .from('exam_access_codes')
        .update({ is_active: false })
        .eq('is_active', true);
      if (disableError) throw disableError;

      const { data: { user } } = await supabase.auth.getUser();
      const hours = Number(expiryHours);
      const expiresAt = hours > 0 ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() : null;
      const { data, error: insertError } = await supabase
        .from('exam_access_codes')
        .insert({ code: createCode(), expires_at: expiresAt, created_by: user?.id ?? null })
        .select('id, code, expires_at, created_at')
        .single();
      if (insertError) throw insertError;
      setActiveCode(data);
    } catch (saveError) {
      console.error('Exam code creation failed:', saveError);
      setError('تعذر إنشاء الرمز. حاول مرة أخرى أو تحقق من صلاحيات حساب المعلم.');
      loadCode();
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!activeCode) return;
    setSaving(true);
    setError('');
    const { error: updateError } = await supabase
      .from('exam_access_codes')
      .update({ is_active: false })
      .eq('id', activeCode.id);
    if (updateError) {
      setError('تعذر إيقاف الرمز. حاول مرة أخرى.');
    } else {
      setActiveCode(null);
      setCopied(false);
    }
    setSaving(false);
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(activeCode.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const expired = activeCode?.expires_at && new Date(activeCode.expires_at) <= new Date();

  return (
    <section className="mol-card p-5 md:p-7 mb-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="grid place-items-center shrink-0" style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--mol-cobalt-soft)', color: 'var(--mol-cobalt)' }}><KeyRound size={21} /></div>
        <div>
          <h2 className="text-lg font-extrabold">إدارة رمز الاختبار</h2>
          <p className="text-sm font-bold mt-1" style={{ color: 'var(--mol-muted)' }}>أنشئ رمزاً للطلاب، وحدد مدة صلاحيته، أو أوقفه في أي وقت.</p>
        </div>
      </div>

      {loading ? <div className="flex items-center gap-2 py-3 font-bold" style={{ color: 'var(--mol-muted)' }}><Loader2 className="animate-spin" size={18} /> جارٍ التحميل…</div> : activeCode && !expired ? (
        <div className="rounded-2xl border p-4 md:p-5" style={{ borderColor: 'var(--mol-green)', background: 'var(--mol-green-soft)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-extrabold mb-1" style={{ color: 'var(--mol-green)' }}>الاختبار مفتوح · الرمز النشط</div>
              <div className="font-mono text-2xl md:text-3xl font-extrabold tracking-[0.18em]" dir="ltr">{activeCode.code}</div>
              <div className="text-xs font-bold mt-2" style={{ color: 'var(--mol-muted)' }}>
                {activeCode.expires_at ? `ينتهي ${new Date(activeCode.expires_at).toLocaleString('ar')}` : 'لا يوجد وقت انتهاء تلقائي'}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" className="mol-btn mol-btn-ghost px-4 py-2 inline-flex items-center gap-2" onClick={copyCode}>
                {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'تم النسخ' : 'نسخ الرمز'}
              </button>
              <button type="button" className="mol-btn mol-btn-ghost px-4 py-2 inline-flex items-center gap-2" disabled={saving} onClick={deactivate}>
                <Power size={16} /> إيقاف
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border p-4 md:p-5" style={{ borderColor: 'var(--mol-line-strong)', background: 'var(--mol-surface-2)' }}>
          <p className="font-extrabold mb-4">لا يوجد اختبار مفتوح حالياً</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-52">
              <label htmlFor="code-expiry" className="mol-label">مدة الاختبار بالساعات</label>
              <input id="code-expiry" type="number" min="1" step="1" className="mol-input" value={expiryHours} onChange={(event) => setExpiryHours(event.target.value)} placeholder="فارغ = بلا انتهاء" />
            </div>
            <button type="button" className="mol-btn mol-btn-primary px-5 py-3 inline-flex items-center gap-2" disabled={saving} onClick={generate}>
              {saving ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />} إنشاء وفتح الاختبار
            </button>
          </div>
          {expired && <p className="text-xs font-bold mt-3" style={{ color: 'var(--mol-amber)' }}>انتهت صلاحية الرمز السابق؛ أنشئ رمزاً جديداً لفتح اختبار آخر.</p>}
        </div>
      )}

      {error && <p role="alert" className="text-sm font-bold mt-3" style={{ color: 'var(--mol-red)' }}>{error}</p>}
    </section>
  );
}
