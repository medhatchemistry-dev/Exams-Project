import React, { useEffect, useMemo, useState } from 'react';
import { Award, Check, Download, Loader2, Palette, X } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import Certificate from '@/components/quiz/Certificate';
import { CERTIFICATE_TEMPLATES } from '@/lib/certificateTemplates';
import { saveExamCertificateTemplate } from '@/lib/examRepository';

export default function CertificatesPanel() {
  const [results, setResults] = useState([]);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState('results');
  const [examId, setExamId] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateNotice, setTemplateNotice] = useState('');

  const selectedExam = useMemo(() => exams.find((exam) => String(exam.id) === examId), [examId, exams]);
  const templateByExam = useMemo(() => new Map(exams.map((exam) => [String(exam.id), exam.certificate_template_id || 1])), [exams]);

  const loadCertificates = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [resultsResponse, examsResponse] = await Promise.all([
        supabase.from('exam_results').select('*').eq('is_perfect', true).order('created_at', { ascending: false }).limit(200),
        supabase.from('exams').select('id, title, certificate_template_id').order('created_at', { ascending: false }),
      ]);
      if (resultsResponse.error) throw resultsResponse.error;
      if (examsResponse.error) throw examsResponse.error;
      setResults(resultsResponse.data || []);
      setExams(examsResponse.data || []);
      if (!examId && examsResponse.data?.length) setExamId(String(examsResponse.data[0].id));
    } catch (error) {
      console.error('Certificates load failed:', error);
      setLoadError('تعذر تحميل الشهادات والقوالب. تحقق من اتصالك وصلاحية حساب المعلم.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCertificates(); }, []);

  const chooseTemplate = async (templateId) => {
    if (!selectedExam || savingTemplate) return;
    setSavingTemplate(true);
    setTemplateNotice('');
    try {
      const saved = await saveExamCertificateTemplate(selectedExam.id, templateId);
      setExams((current) => current.map((exam) => exam.id === saved.id ? { ...exam, certificate_template_id: saved.certificate_template_id } : exam));
      setTemplateNotice(`تم حفظ قالب «${CERTIFICATE_TEMPLATES[templateId - 1].name}» لاختبار ${selectedExam.title}.`);
    } catch (error) {
      console.error('Certificate template save failed:', error);
      setTemplateNotice('تعذر حفظ القالب. تحقق من تحديث قاعدة البيانات وصلاحية حساب المعلم.');
    } finally {
      setSavingTemplate(false);
    }
  };

  if (loading) {
    return <div role="status" className="flex items-center gap-2 p-6 font-bold" style={{ color: 'var(--mol-muted)' }}><Loader2 className="animate-spin" size={18} /> جاري تحميل الشهادات…</div>;
  }

  if (loadError) {
    return <div className="mol-card p-6 text-center font-bold" style={{ color: 'var(--mol-red)' }}>{loadError}<button type="button" className="mol-btn mol-btn-ghost ml-3 px-3 py-1" onClick={loadCertificates}>إعادة المحاولة</button></div>;
  }

  return (
    <div className="space-y-4">
      <div className="mol-card flex flex-wrap gap-2 p-2" role="tablist" aria-label="إدارة الشهادات">
        <button type="button" role="tab" aria-selected={activeTab === 'results'} className={`mol-btn px-4 py-2 ${activeTab === 'results' ? 'mol-btn-primary' : 'mol-btn-ghost'}`} onClick={() => setActiveTab('results')}><Award className="mr-2 inline" size={16} /> شهادات الطلاب ({results.length})</button>
        <button type="button" role="tab" aria-selected={activeTab === 'templates'} className={`mol-btn px-4 py-2 ${activeTab === 'templates' ? 'mol-btn-primary' : 'mol-btn-ghost'}`} onClick={() => setActiveTab('templates')}><Palette className="mr-2 inline" size={16} /> القوالب (20)</button>
      </div>

      {activeTab === 'results' ? (
        results.length === 0 ? <div className="mol-card p-8 text-center font-bold" style={{ color: 'var(--mol-muted)' }}>ستظهر هنا محاولات الدرجة الكاملة. يتم إنشاء الشهادة تلقائياً عند تحقيق 100%.</div> : (
          <div className="space-y-2.5">
            {results.map((result) => (
              <article key={result.id} className="mol-card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3"><Award size={20} style={{ color: 'var(--mol-amber)' }} /><div><div className="font-extrabold">{result.student_name}</div><div className="text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>{result.exam_title_snapshot || 'الاختبار العام'} · الصف {result.grade} · شعبة {result.section} · {result.score}/{result.total}</div></div></div>
                <button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-1.5 px-4 py-2" onClick={() => setSelected(result)}><Download size={16} /> عرض / تحميل</button>
              </article>
            ))}
          </div>
        )
      ) : (
        <section className="space-y-4">
          <div className="mol-card grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="mol-label">اختر الاختبار لتخصيص شهاداته<select className="mol-input mt-1" value={examId} onChange={(event) => { setExamId(event.target.value); setTemplateNotice(''); }}><option value="">اختر اختباراً</option>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title}</option>)}</select></label>
            <p className="text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>{selectedExam ? `القالب الحالي: ${CERTIFICATE_TEMPLATES[(selectedExam.certificate_template_id || 1) - 1]?.name || CERTIFICATE_TEMPLATES[0].name}` : 'استورد اختباراً أولاً لتعيين قالب خاص به.'}</p>
          </div>
          {templateNotice && <p role="status" className="mol-card p-3 text-sm font-bold" style={{ color: templateNotice.startsWith('تعذر') ? 'var(--mol-red)' : 'var(--mol-green)' }}>{templateNotice}</p>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {CERTIFICATE_TEMPLATES.map((template) => {
              const isCurrent = selectedExam && Number(selectedExam.certificate_template_id || 1) === template.id;
              return (
                <article key={template.id} className="mol-card overflow-hidden p-3">
                  <div className="relative grid min-h-40 place-items-center overflow-hidden rounded-xl border-4 p-4 text-center" style={{ background: template.background, borderColor: template.accent, color: template.accent }}>
                    <span aria-hidden="true" className="absolute left-3 top-1 text-2xl opacity-60">{template.symbol}</span><span aria-hidden="true" className="absolute bottom-1 right-3 text-2xl opacity-60">{template.symbol}</span>
                    <div><p className="text-[10px] font-extrabold tracking-[0.2em]">CERTIFICATE</p><p className="mt-1 text-lg font-black">شهادة تقدير</p><p className="mt-2 text-sm font-bold" style={{ color: '#25334a' }}>اسم الطالب يظهر هنا</p><p className="mt-1 text-[11px] font-bold" dir="ltr" style={{ color: '#526174' }}>Student name preview</p><p className="mt-2 text-xs font-bold">{template.name}</p></div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-3"><div><p className="font-extrabold">{template.id}. {template.name}</p>{isCurrent && <span className="mt-1 inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--mol-green)' }}><Check size={13} /> محدد لهذا الاختبار</span>}</div><button type="button" className={`mol-btn inline-flex items-center gap-1.5 px-3 py-2 text-sm ${isCurrent ? 'mol-btn-primary' : 'mol-btn-ghost'}`} disabled={!selectedExam || savingTemplate || isCurrent} onClick={() => chooseTemplate(template.id)}>{savingTemplate ? <Loader2 size={15} className="animate-spin" /> : isCurrent ? <Check size={15} /> : null}{isCurrent ? 'المحدد' : 'اختيار'}</button></div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {selected && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto p-4" style={{ background: 'rgba(15,23,42,0.5)' }} onClick={() => setSelected(null)}>
          <div className="my-auto w-full max-w-5xl rounded-2xl bg-white p-4 md:p-5" onClick={(event) => event.stopPropagation()}>
            <div className="mb-2 flex justify-end"><button type="button" className="mol-btn mol-btn-ghost p-2" aria-label="إغلاق" onClick={() => setSelected(null)}><X size={20} /></button></div>
            <Certificate student={{ name: selected.student_name, grade: selected.grade, section: selected.section }} examTitle={selected.exam_title_snapshot} templateId={templateByExam.get(String(selected.exam_id)) || 1} />
          </div>
        </div>
      )}
    </div>
  );
}
