import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Power, RefreshCw } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';

function createCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16).toUpperCase();
}

export default function ExamAccessPanel({ exams, onChanged }) {
  const [examId, setExamId] = useState('');
  const [expiryHours, setExpiryHours] = useState('');
  const [activeCode, setActiveCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const loadCode = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase.from('exam_access_codes')
        .select('id, code, expires_at, created_at, exam_id, exams(title)')
        .eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (queryError) throw queryError;
      setActiveCode(data);
    } catch (loadError) {
      console.error('Active access code load failed:', loadError);
      setError('تعذر تحميل رمز الاختبار النشط. تحقق من تحديث قاعدة البيانات.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCode(); }, [loadCode]);

  const issue = async () => {
    if (!examId || !window.confirm('سيؤدي إنشاء هذا الرمز إلى إيقاف الرمز النشط الحالي. هل تريد المتابعة؟')) return;
    setSaving(true);
    setError('');
    try {
      const hours = Number(expiryHours);
      const expiresAt = hours > 0 ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() : null;
      const { error: rpcError } = await supabase.rpc('issue_exam_access_code', {
        target_exam_id: Number(examId),
        new_code: createCode(),
        new_expires_at: expiresAt,
      });
      if (rpcError) throw rpcError;
      await loadCode();
      onChanged?.();
    } catch (issueError) {
      console.error('Access code issuance failed:', issueError);
      setError('تعذر إنشاء الرمز. تحقق من الاختبار وصلاحية حساب المعلم.');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!activeCode || !window.confirm('سيتم إيقاف رمز الاختبار الحالي.')) return;
    setSaving(true);
    setError('');
    try {
      const { error: updateError } = await supabase.from('exam_access_codes').update({ is_active: false }).eq('id', activeCode.id);
      if (updateError) throw updateError;
      setActiveCode(null);
      onChanged?.();
    } catch (deactivateError) {
      console.error('Access code deactivation failed:', deactivateError);
      setError('تعذر إيقاف الرمز. حاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };

  const copyCode = async () => {
    if (!activeCode?.code) return;
    await navigator.clipboard.writeText(activeCode.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const available = exams.filter((exam) => exam.status === 'available');

  return (
    <section className="mol-card space-y-4 p-5 md:p-6">
      <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: 'var(--mol-cobalt-soft)', color: 'var(--mol-cobalt)' }}><KeyRound size={21} /></span><div><h3 className="text-lg font-extrabold">رمز دخول الاختبار</h3><p className="text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>كل رمز يفتح اختباراً واحداً فقط. إنشاء رمز جديد يوقف الرمز النشط الحالي.</p></div></div>
      {loading ? <div role="status" className="flex items-center gap-2 p-3 font-bold"><Loader2 size={17} className="animate-spin" /> جارٍ تحميل الرمز…</div> : activeCode ? <div className="rounded-xl border p-4" style={{ borderColor: 'var(--mol-green)', background: 'var(--mol-green-soft)' }}><p className="text-xs font-extrabold" style={{ color: 'var(--mol-green)' }}>الرمز النشط · {activeCode.exams?.title || 'الاختبار المرفق'}</p><p dir="ltr" className="my-2 font-mono text-2xl font-extrabold tracking-[0.16em]">{activeCode.code}</p><p className="text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>{activeCode.expires_at ? `ينتهي ${new Date(activeCode.expires_at).toLocaleString('ar')}` : 'دون وقت انتهاء'}</p><div className="mt-3 flex gap-2"><button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-2 px-3 py-2" onClick={copyCode}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'تم النسخ' : 'نسخ'}</button><button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-2 px-3 py-2" disabled={saving} onClick={deactivate}><Power size={16} /> إيقاف</button></div></div> : <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px_auto]"><label className="mol-label">الاختبار<select className="mol-input mt-1" value={examId} onChange={(event) => setExamId(event.target.value)}><option value="">اختر اختباراً متاحاً</option>{available.map((exam) => <option key={exam.id} value={exam.id}>{exam.title}</option>)}</select></label><label className="mol-label">الصلاحية بالساعات<input className="mol-input mt-1" type="number" min="1" step="1" value={expiryHours} onChange={(event) => setExpiryHours(event.target.value)} placeholder="فارغ = بدون انتهاء" /></label><button type="button" className="mol-btn mol-btn-primary mt-auto inline-flex items-center justify-center gap-2 px-4 py-2.5" disabled={saving || !examId} onClick={issue}>{saving ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />} إنشاء الرمز</button></div>}
      {!loading && !available.length && !activeCode && <p className="text-sm font-bold" style={{ color: 'var(--mol-amber)' }}>استورد اختباراً متاحاً أولاً لإنشاء رمز دخول.</p>}
      {error && <p role="alert" className="font-bold" style={{ color: 'var(--mol-red)' }}>{error}</p>}
    </section>
  );
}
