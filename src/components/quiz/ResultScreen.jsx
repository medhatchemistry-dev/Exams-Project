import React, { useRef, useState } from 'react';
import { Award, TrendingUp, FlaskConical, Lightbulb, Printer, CheckCircle2, Download, Loader2 } from 'lucide-react';
import AnswerReport from './AnswerReport';
import Certificate from './Certificate';
import { downloadPaginatedPdf } from '@/lib/pdfReport';

function skillRow(icon, label, status, color) {
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: 'var(--mol-tile)', border: '1px solid var(--mol-line-strong)' }}>
      <div style={{ color }}>{icon}</div>
      <div className="flex-1 text-sm font-bold">{label}</div>
      <div className="text-sm font-extrabold" style={{ color }}>{status}</div>
    </div>
  );
}

export default function ResultScreen({ student, examTitle, certificateTemplateId = 1, score, total, submissionTime, questions, answers, isLegacy = false, onPrint, onRestart }) {
  const percentage = total ? (score / total) * 100 : 0;
  const grade = percentage >= 90 ? 'ممتاز' : percentage >= 75 ? 'جيد جداً' : percentage >= 60 ? 'جيد' : percentage >= 50 ? 'مقبول' : 'يحتاج تعزيزاً';
  const gradeColor = percentage >= 75 ? 'var(--mol-green)' : percentage >= 50 ? 'var(--mol-amber)' : 'var(--mol-red)';

  const reportRef = useRef(null);
  const [generating, setGenerating] = useState(false);

  const downloadPdf = async () => {
    const el = reportRef.current;
    if (!el || generating) return;
    setGenerating(true);
    try {
      await downloadPaginatedPdf(el, `تقرير-النتيجة-${student?.name || 'student'}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mol-wrap max-w-3xl mx-auto px-4 py-10 md:py-16">
      <div className="mol-card print-block p-7 md:p-10 mol-fade-up">
        <div className="text-center mb-8">
          <div
            className="mx-auto mb-4 grid place-items-center"
            style={{ width: 84, height: 84, borderRadius: 24, background: `${gradeColor}22`, border: `1px solid ${gradeColor}` }}
          >
            <Award size={44} style={{ color: gradeColor }} />
          </div>
          <div className="text-xs font-extrabold tracking-widest" style={{ color: 'var(--mol-muted)' }}>
            تقرير النتيجة وتحليل المهارات — Spectroscopy Report
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold mt-2">تم تسليم الاختبار بنجاح</h2>
          <p className="text-sm font-bold mt-1" style={{ color: 'var(--mol-muted)' }}>
            {student.name} • {student.grade} ({student.track}) • شعبة {student.section}
          </p>
          {examTitle && <p className="mt-1 text-sm font-extrabold" style={{ color: 'var(--mol-cobalt)' }}>{examTitle}</p>}
        </div>

        {/* score */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="p-4 rounded-2xl text-center" style={{ background: 'var(--mol-tile)', border: '1px solid var(--mol-line-strong)' }}>
            <div className="text-3xl font-extrabold" style={{ color: gradeColor, fontFamily: "'Instrument Serif', serif" }}>{score}</div>
            <div className="text-xs font-bold mt-1" style={{ color: 'var(--mol-muted)' }}>من {total}</div>
          </div>
          <div className="p-4 rounded-2xl text-center" style={{ background: 'var(--mol-tile)', border: '1px solid var(--mol-line-strong)' }}>
            <div className="text-3xl font-extrabold" style={{ color: gradeColor, fontFamily: "'Instrument Serif', serif" }}>{percentage.toFixed(1)}%</div>
            <div className="text-xs font-bold mt-1" style={{ color: 'var(--mol-muted)' }}>النسبة المئوية</div>
          </div>
          <div className="p-4 rounded-2xl text-center" style={{ background: 'var(--mol-tile)', border: '1px solid var(--mol-line-strong)' }}>
            <div className="text-2xl font-extrabold" style={{ color: gradeColor }}>{grade}</div>
            <div className="text-xs font-bold mt-1" style={{ color: 'var(--mol-muted)' }}>التقدير</div>
          </div>
          <div className="p-4 rounded-2xl text-center" style={{ background: 'var(--mol-tile)', border: '1px solid var(--mol-line-strong)' }}>
            <div className="text-sm font-extrabold leading-tight" style={{ color: 'var(--mol-text)' }}>{submissionTime}</div>
            <div className="text-xs font-bold mt-1" style={{ color: 'var(--mol-muted)' }}>وقت التسليم</div>
          </div>
        </div>

        {/* skills breakdown */}
        <div className="mb-6">
          <h3 className="text-lg font-extrabold mb-3 flex items-center gap-2">
            <FlaskConical size={20} style={{ color: 'var(--mol-red)' }} /> تحليل المهارات والخطة العلاجية
          </h3>
          <div className="space-y-2.5">
            {skillRow(<TrendingUp size={18} />, 'مهارة تحديد المفاهيم الأساسية', percentage >= 70 ? 'متقن ✅' : 'يحتاج تعزيز ⚠️', percentage >= 70 ? 'var(--mol-green)' : 'var(--mol-amber)')}
            {skillRow(<Award size={18} />, 'مهارة تحليل التطبيقات والمسائل', percentage >= 80 ? 'متقن ✅' : 'يحتاج مراجعة ⚠️', percentage >= 80 ? 'var(--mol-green)' : 'var(--mol-amber)')}
            {skillRow(<FlaskConical size={18} />, 'مهارة الاستنتاج العلمي', percentage >= 60 ? 'مقبول 💡' : 'يحتاج خطة مكثفة ❌', percentage >= 60 ? 'var(--mol-green)' : 'var(--mol-red)')}
          </div>
          <div
            className="flex items-start gap-3 p-4 rounded-xl mt-3"
            style={{ background: 'var(--mol-cobalt-soft)', border: '1px solid var(--mol-cobalt)' }}
          >
            <Lightbulb size={20} style={{ color: 'var(--mol-cobalt)', flex: '0 0 auto', marginTop: 2 }} />
            <div className="text-sm font-bold" style={{ color: 'var(--mol-text)' }}>
              <strong>الخطة العلاجية المقترحة:</strong>{' '}
              {percentage >= 85
                ? 'ممتاز، يوصى بالأنشطة الإثرائية المتقدمة.'
                : 'يرجى مراجعة أمثلة الكتاب المدرسي وحل التمارين التدريبية المتعلقة بالمادة.'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 no-print">
          <button
            className="mol-btn mol-btn-primary px-6 py-3 inline-flex items-center gap-2"
            onClick={downloadPdf}
            disabled={generating}
          >
            {generating ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            {isLegacy ? 'تحميل PDF — إجابات الطالب' : 'تحميل PDF — الحل والتصحيح'}
          </button>
          <button className="mol-btn mol-btn-ghost px-6 py-3 inline-flex items-center gap-2" onClick={onPrint}>
            <Printer size={18} /> طباعة التقرير
          </button>
          <button className="mol-btn mol-btn-ghost px-6 py-3 inline-flex items-center gap-2" onClick={onRestart}>
            <CheckCircle2 size={18} /> إنهاء
          </button>
        </div>
      </div>
      <p className="text-center text-xs font-bold mt-6 no-print" style={{ color: 'var(--mol-muted)' }}>
        مدرسة خالد بن الوليد • إعداد الأستاذ محمد مدحت • منصة لغة الكيمياء
      </p>

      {total > 0 && score === total && (
        <div className="mt-6">
          <Certificate student={student} examTitle={examTitle} templateId={certificateTemplateId} />
        </div>
      )}

      {/* Off-screen full correction report — captured into the downloadable PDF */}
      <div className="no-print" style={{ position: 'fixed', left: '-10000px', top: 0, zIndex: -1 }}>
        <AnswerReport
          innerRef={reportRef}
          student={student}
          score={score}
          total={total}
          submissionTime={submissionTime}
          questions={questions}
          answers={answers}
          showAnswerKey={!isLegacy}
        />
      </div>
    </div>
  );
}
