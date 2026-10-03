import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, FileUp, Globe, Loader2, Timer, Upload } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { GRADE_LABELS, STRUCTURE } from '@/lib/academicStructure';
import { parseExamHtml } from '@/lib/examImport';
import { saveExam } from '@/lib/examRepository';

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

function localDateTime(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function makeAccessCode() {
  const random = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16).toUpperCase();
}

function Progress({ step }) {
  const steps = ['مصدر الاختبار', 'الصف والوقت', 'التأكيد'];
  return <ol className="grid grid-cols-3 gap-2" aria-label="خطوات إنشاء الاختبار">
    {steps.map((label, index) => <li key={label} className="flex items-center gap-2 text-xs font-extrabold sm:text-sm" style={{ color: index <= step ? 'var(--mol-cobalt)' : 'var(--mol-muted)' }}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: index <= step ? 'var(--mol-cobalt-soft)' : 'var(--mol-surface-2)' }}>{index < step ? <CheckCircle2 size={15} /> : index + 1}</span>
      <span>{label}</span>
    </li>)}
  </ol>;
}

export default function ExamImportDialog({ onClose, onImported }) {
  const [step, setStep] = useState(0);
  const [sourceMode, setSourceMode] = useState('file');
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [title, setTitle] = useState('');
  const [preview, setPreview] = useState(null);
  const [grade, setGrade] = useState('');
  const [track, setTrack] = useState('');
  const [section, setSection] = useState('');
  const [expiryMode, setExpiryMode] = useState('unlimited');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedExam, setSavedExam] = useState(null);
  const tracks = grade ? Object.keys(STRUCTURE[grade] || {}) : [];
  const sections = grade && track ? STRUCTURE[grade]?.[track] || [] : [];
  const bankKey = grade && track ? `${grade}-${track}` : '';
  const chosenQuestions = preview?.banks?.[bankKey] || preview?.generalQuestions || [];

  const selectInitialBank = (parsed) => {
    const firstBank = parsed.bankSummaries[0]?.bankKey || '';
    const [firstGrade, firstTrack] = firstBank.split('-');
    if (parsed.banks?.[firstBank] && STRUCTURE[firstGrade]?.[firstTrack]) {
      setGrade(firstGrade);
      setTrack(firstTrack);
    }
  };

  const acceptFile = async (nextFile) => {
    setFile(nextFile || null);
    setPreview(null);
    setError('');
    setSavedExam(null);
    if (!nextFile) return;
    if (nextFile.size > MAX_SOURCE_BYTES) {
      setError('حجم الملف أكبر من 10 MiB. قلّل حجم الملف ثم أعد رفعه.');
      return;
    }
    const isHtml = /\.html?$/i.test(nextFile.name);
    const isPdf = /\.pdf$/i.test(nextFile.name);
    if (!isHtml && !isPdf) {
      setError('اختر ملف HTML أو PDF نصياً.');
      return;
    }
    setSourceLabel(nextFile.name);
    setTitle((current) => current || nextFile.name.replace(/\.(html?|pdf)$/i, '').replace(/[-_]+/g, ' ').trim());
    if (!isHtml) return;
    try {
      const parsed = parseExamHtml(await nextFile.text(), nextFile.name);
      setPreview(parsed);
      selectInitialBank(parsed);
    } catch (parseError) {
      console.error('Exam HTML import validation failed:', parseError);
      setError(parseError.message || 'لم أستطع قراءة ملف HTML.');
    }
  };

  const inspectUrl = async () => {
    setError('');
    setPreview(null);
    let parsedUrl;
    try { parsedUrl = new URL(url.trim()); } catch { setError('أدخل رابطاً كاملاً يبدأ بـ https://.'); return; }
    if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
      setError('لأمان الاستيراد، استخدم رابط HTTPS عاماً بدون بيانات دخول داخل الرابط.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(parsedUrl.href, { method: 'GET', mode: 'cors', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`رد الموقع برمز ${response.status}.`);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) throw new Error('الرابط لا يعرض صفحة HTML. ارفع ملف HTML أو PDF بدلاً منه.');
      const source = await response.text();
      if (new TextEncoder().encode(source).byteLength > 5 * 1024 * 1024) throw new Error('صفحة المصدر أكبر من 5 MiB. احفظ بنك الأسئلة في ملف HTML أصغر.');
      const parsed = parseExamHtml(source, 'source.html');
      setPreview(parsed);
      setSourceLabel(parsedUrl.hostname);
      setTitle((current) => current || parsedUrl.hostname.replace(/^www\./, ''));
      selectInitialBank(parsed);
    } catch (loadError) {
      console.error('Exam URL import failed:', loadError);
      const browserBlocked = loadError instanceof TypeError || loadError.name === 'AbortError';
      setError(browserBlocked
        ? 'الموقع يمنع القراءة المباشرة أو لم يرد في الوقت المحدد. نزّل صفحة الاختبار بصيغة HTML وارفعها؛ لا يتم تشغيل كود الصفحة.'
        : `${loadError.message} تأكد أن الصفحة تحتوي بنك الأسئلة المنظم.`);
    } finally {
      setBusy(false);
    }
  };

  const continueFromSource = async () => {
    setError('');
    if (!file && !preview) { setError('اختر ملفاً أو افحص رابط الاختبار أولاً.'); return; }
    setStep(1);
  };

  const reviewSetup = async () => {
    setError('');
    if (!title.trim()) { setError('اكتب اسم الاختبار.'); return; }
    if (!grade || !track || !section) { setError('اختر الصف والمسار والشعبة المستهدفة.'); return; }
    if (expiryMode === 'timed' && (!expiresAt || new Date(expiresAt) <= new Date())) { setError('اختر وقت انتهاء مستقبلياً.'); return; }
    let parsed = preview;
    if (file?.name.toLowerCase().endsWith('.pdf')) {
      setBusy(true);
      try {
        const { parseExamPdf } = await import('@/lib/examImportPdf');
        parsed = await parseExamPdf(file, bankKey, file.name);
        setPreview(parsed);
      } catch (pdfError) {
        console.error('Exam PDF import failed:', pdfError);
        setError(pdfError.message || 'تعذر قراءة PDF.');
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    const selectedQuestions = parsed?.banks?.[bankKey] || parsed?.generalQuestions || [];
    if (!selectedQuestions.length) { setError(`لم أجد أسئلة للاختبار المحدد.`); return; }
    setStep(2);
  };

  const activate = async () => {
    setBusy(true);
    setError('');
    let exam = savedExam;
    try {
      const expiryDate = expiryMode === 'timed' ? new Date(expiresAt) : null;
      if (!exam) {
        const { data: userData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const selectedBanks = { [bankKey]: chosenQuestions };
        exam = await saveExam({
          title: title.trim(),
          source_filename: sourceLabel || 'teacher-upload.html',
          banks: selectedBanks,
          created_by: userData.user?.id ?? null,
          target_grade: grade,
          target_track: track,
          target_section: section,
        });
        setSavedExam(exam);
      }

      const { data: activeCode, error: activeError } = await supabase.from('exam_access_codes')
        .select('code, exam_id').eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (activeError) throw activeError;
      if (activeCode && Number(activeCode.exam_id) !== Number(exam.id)
        && !window.confirm('تفعيل هذا الاختبار سيوقف رمز الاختبار النشط الحالي. هل تريد المتابعة؟')) return;

      const code = makeAccessCode();
      const { error: issueError } = await supabase.rpc('issue_exam_access_code', {
        target_exam_id: Number(exam.id),
        new_code: code,
        new_expires_at: expiryDate?.toISOString() ?? null,
      });
      if (issueError) throw issueError;
      onImported({ ...exam, accessCode: code });
    } catch (saveError) {
      console.error('Exam save or activation failed:', saveError);
      if (exam) setSavedExam(exam);
      setError(exam
        ? 'تم حفظ الاختبار، لكن تعذر إصدار الرمز. يمكنك إعادة المحاولة دون إنشاء نسخة أخرى.'
        : 'تعذر إنشاء الاختبار. تحقق من اتصال قاعدة البيانات وصلاحية حساب المعلم.');
    } finally {
      setBusy(false);
    }
  };

  const tomorrowAtNoon = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0);
    setExpiryMode('timed');
    setExpiresAt(localDateTime(tomorrow));
  };

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/55 p-3 sm:p-5" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="exam-import-title" className="mol-card max-h-[94vh] w-full max-w-3xl overflow-y-auto p-5 sm:p-7">
        <header className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-extrabold" style={{ color: 'var(--mol-cobalt)' }}>اختبار جديد</p><h3 id="exam-import-title" className="mt-1 text-2xl font-extrabold">أنشئ اختباراً وفعّله</h3></div>
          <button type="button" className="mol-btn mol-btn-ghost px-3 py-2" disabled={busy} onClick={onClose}>إغلاق</button>
        </header>
        <div className="my-6"><Progress step={step} /></div>

        {step === 0 && <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 rounded-xl p-1" style={{ background: 'var(--mol-surface-2)' }}>
            <button type="button" onClick={() => setSourceMode('file')} className={`mol-btn inline-flex items-center justify-center gap-2 px-3 py-2.5 ${sourceMode === 'file' ? 'mol-btn-primary' : 'mol-btn-ghost'}`}><FileUp size={17} /> ملف HTML أو PDF</button>
            <button type="button" onClick={() => setSourceMode('url')} className={`mol-btn inline-flex items-center justify-center gap-2 px-3 py-2.5 ${sourceMode === 'url' ? 'mol-btn-primary' : 'mol-btn-ghost'}`}><Globe size={17} /> رابط الاختبار</button>
          </div>
          {sourceMode === 'file' ? <label className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition hover:border-blue-500" style={{ borderColor: 'var(--mol-line-strong)', background: 'var(--mol-surface-2)' }}>
            {file ? <FileText size={30} style={{ color: 'var(--mol-cobalt)' }} /> : <Upload size={30} style={{ color: 'var(--mol-muted)' }} />}
            <span className="mt-3 font-extrabold">{file?.name || 'اسحب الملف هنا أو اضغط للاختيار'}</span>
            <span className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>HTML أو PDF نصي · حتى 10 MiB</span>
            <input className="sr-only" type="file" accept=".html,.htm,.pdf,text/html,application/pdf" onChange={(event) => acceptFile(event.target.files?.[0])} />
          </label> : <div className="space-y-3 rounded-2xl border p-5" style={{ borderColor: 'var(--mol-line-strong)' }}>
            <label className="mol-label block">رابط صفحة الاختبار<input dir="ltr" className="mol-input mt-2 text-left" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://school.example/exam.html" /></label>
            <p className="text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>يقرأ النظام HTML الأولي للصفحة بأمان ولا يشغّل JavaScript. إذا منع الموقع القراءة المباشرة، ارفع نسخة HTML محفوظة.</p>
            <button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-2 px-4 py-2" onClick={inspectUrl} disabled={busy || !url.trim()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />} فحص الرابط</button>
          </div>}
          {file?.name.toLowerCase().endsWith('.pdf') && <p className="rounded-xl p-3 text-sm font-bold" style={{ background: 'var(--mol-cobalt-soft)', color: 'var(--mol-cobalt)' }}>يقرأ PDF النصي المنظم الذي يحتوي خيارات A/B/C/D أو أ/ب/ج/د ومفتاح إجابة صريحاً. لا يخمّن النظام الإجابات المفقودة.</p>}
          {preview && <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: 'var(--mol-green-soft)', color: 'var(--mol-green)' }}><CheckCircle2 size={20} className="mt-0.5 shrink-0" /><div><p className="font-extrabold">تم العثور على بنك أسئلة</p><p className="mt-1 text-sm font-bold">{preview.bankSummaries.map((item) => `${item.bankKey}: ${item.questionCount}`).join(' · ')}</p></div></div>}
        </div>}

        {step === 1 && <div className="space-y-5">
          <label className="mol-label block">اسم الاختبار<input className="mol-input mt-1" maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="اختبار الكيمياء — الوحدة الأولى" /></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="mol-label">الصف<select className="mol-input mt-1" value={grade} onChange={(event) => { setGrade(event.target.value); setTrack(''); setSection(''); setPreview(file?.name.toLowerCase().endsWith('.pdf') ? null : preview); }}><option value="">اختر الصف</option>{Object.keys(STRUCTURE).map((key) => <option key={key} value={key}>{GRADE_LABELS[key]} ({key})</option>)}</select></label>
            <label className="mol-label">المسار<select className="mol-input mt-1" value={track} disabled={!grade} onChange={(event) => { setTrack(event.target.value); setSection(''); setPreview(file?.name.toLowerCase().endsWith('.pdf') ? null : preview); }}><option value="">اختر المسار</option>{tracks.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="mol-label">الشعبة<select className="mol-input mt-1" value={section} disabled={!track} onChange={(event) => setSection(event.target.value)}><option value="">اختر الشعبة</option>{sections.map((value) => <option key={value} value={value}>شعبة {value}</option>)}</select></label>
          </div>
          {preview && bankKey && <div className="mol-card flex items-center justify-between gap-3 p-4"><span className="font-bold">بنك الصف والمسار المحدد</span><strong>{chosenQuestions.length} سؤال · {bankKey}</strong></div>}
          <fieldset className="space-y-3 rounded-2xl border p-4" style={{ borderColor: 'var(--mol-line-strong)' }}>
            <legend className="mol-label px-1">متى ينتهي رمز دخول الطلاب؟</legend>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-bold"><input type="radio" name="exam-expiry" checked={expiryMode === 'unlimited'} onChange={() => setExpiryMode('unlimited')} /> يبقى مفتوحاً حتى أوقفه</label>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-bold"><input type="radio" name="exam-expiry" checked={expiryMode === 'timed'} onChange={() => setExpiryMode('timed')} /> ينتهي في وقت محدد</label>
            {expiryMode === 'timed' && <div className="flex flex-wrap gap-2"><input aria-label="موعد انتهاء رمز الاختبار" className="mol-input min-w-0 flex-1" type="datetime-local" min={localDateTime(new Date(Date.now() + 60_000))} value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /><button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-1.5 px-3 py-2" onClick={tomorrowAtNoon}><Timer size={15} /> غداً 12 ظهراً</button></div>}
          </fieldset>
        </div>}

        {step === 2 && <div className="space-y-4">
          <div className="mol-card p-5"><p className="text-xs font-extrabold" style={{ color: 'var(--mol-cobalt)' }}>مراجعة قبل التفعيل</p><h4 className="mt-1 text-xl font-extrabold">{title}</h4><p className="mt-2 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>{sourceLabel} · {GRADE_LABELS[grade]} · {track} · شعبة {section}</p><p className="mt-4 font-extrabold">{chosenQuestions.length} سؤالاً</p><p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>{expiryMode === 'timed' ? `ينتهي ${new Date(expiresAt).toLocaleString('ar')}` : 'يبقى مفتوحاً حتى توقفه يدوياً'}</p></div>
          <p className="rounded-xl p-4 text-sm font-bold" style={{ background: 'var(--mol-amber-soft, var(--mol-surface-2))', color: 'var(--mol-amber)' }}>تفعيل هذا الاختبار يوقف رمز الاختبار النشط الحالي. تستطيع إيقاف الرمز الجديد أو إنهاء الاختبار لاحقاً.</p>
          {savedExam && <p className="font-bold" style={{ color: 'var(--mol-amber)' }}>تم حفظ الاختبار بالفعل. أعد المحاولة لإصدار الرمز دون إنشاء نسخة أخرى.</p>}
        </div>}

        {error && <p role="alert" className="mt-5 rounded-xl p-4 text-sm font-bold" style={{ background: 'var(--mol-red-soft)', color: 'var(--mol-red)' }}>{error}</p>}
        <footer className="mt-7 flex flex-wrap justify-between gap-2 border-t pt-4" style={{ borderColor: 'var(--mol-line-strong)' }}>
          <button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-2 px-4 py-2.5" disabled={busy} onClick={() => step ? setStep(step - 1) : onClose()}><ArrowRight size={16} /> {step ? 'السابق' : 'إلغاء'}</button>
          {step === 0 && <button type="button" className="mol-btn mol-btn-primary inline-flex items-center gap-2 px-5 py-2.5" disabled={busy || (!file && !preview)} onClick={continueFromSource}>{busy ? <Loader2 size={16} className="animate-spin" /> : null} متابعة <ArrowLeft size={16} /></button>}
          {step === 1 && <button type="button" className="mol-btn mol-btn-primary inline-flex items-center gap-2 px-5 py-2.5" disabled={busy} onClick={reviewSetup}>مراجعة الاختبار <ArrowLeft size={16} /></button>}
          {step === 2 && <button type="button" className="mol-btn mol-btn-primary inline-flex items-center gap-2 px-5 py-2.5" disabled={busy} onClick={activate}>{busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}{busy ? 'جارٍ التفعيل…' : 'إنشاء الاختبار وتفعيل الرمز'}</button>}
        </footer>
      </section>
    </div>
  );
}
