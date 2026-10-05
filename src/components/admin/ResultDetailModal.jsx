import React, { useEffect, useRef, useState } from 'react';
import { X, Download, Loader2, FileSpreadsheet } from 'lucide-react';
import AnswerReport from '@/components/quiz/AnswerReport';
import { downloadPaginatedPdf } from '@/lib/pdfReport';
import { exportSingleResultCsv } from '@/lib/excelExport';
import { loadQuestionBanks, buildExam } from '@/lib/quizBanks';
import { getResultQuestions } from '@/lib/resultQuestions';

// Rebuilds the student's exact exam deterministically from their student number
// (same seeded shuffle used when they took it) — no oversized data stored.
export default function ResultDetailModal({ result, onClose }) {
  const ref = useRef(null);
  const [generating, setGenerating] = useState(false);
  const [questions, setQuestions] = useState(null);
  const [pdfError, setPdfError] = useState('');
  let answers = result.answers_json || {};
  try {
    if (typeof answers === 'string') answers = JSON.parse(answers || '{}');
  } catch {
    answers = {};
  }

  useEffect(() => {
    const snapshot = getResultQuestions(result);
    if (snapshot) {
      setQuestions(snapshot);
      return undefined;
    }

    let alive = true;
    loadQuestionBanks()
      .then((banks) => {
        if (alive) setQuestions(buildExam(banks, result.grade, result.track, result.student_number, Number.isInteger(result.total) && result.total > 0 ? result.total : 25));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [result]);

  const download = async () => {
    if (generating || !questions) return;
    setGenerating(true);
    setPdfError('');
    try {
      await downloadPaginatedPdf(ref.current, `تقرير-${result.student_name}.pdf`);
    } catch (error) {
      console.error('Result PDF export failed:', error);
      setPdfError('تعذر تحميل بعض الصور أو تجهيز التقرير. تحقق من الصور ثم أعد المحاولة.');
    } finally {
      setGenerating(false);
    }
  };

  const exportExcel = () => {
    if (questions) exportSingleResultCsv({ ...result, questions });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.5)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[88vh] overflow-y-auto mol-scroll" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <div className="flex gap-2">
            <button className="mol-btn mol-btn-ghost px-4 py-2 inline-flex items-center gap-2" onClick={exportExcel} disabled={!questions}>
              <FileSpreadsheet size={16} /> تصدير Excel
            </button>
            <button className="mol-btn mol-btn-primary px-4 py-2 inline-flex items-center gap-2" onClick={download} disabled={generating || !questions}>
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} تحميل PDF
            </button>
          </div>
          <button onClick={onClose} aria-label="إغلاق"><X size={22} /></button>
        </div>
        {!questions ? (
          <div className="flex items-center gap-2 font-bold p-8" style={{ color: 'var(--mol-muted)' }}>
            <Loader2 className="animate-spin" size={18} /> جاري تجهيز تقرير الامتحان…
          </div>
        ) : (
          <>
            {pdfError && <p role="alert" className="px-5 pb-3 text-sm font-bold" style={{ color: 'var(--mol-red)' }}>{pdfError}</p>}
            <AnswerReport
              innerRef={ref}
              student={{ name: result.student_name, grade: result.grade, track: result.track, section: result.section, id: result.student_number }}
              score={result.score}
              total={result.total}
              submissionTime={result.submission_time}
              questions={questions}
              answers={answers}
            />
          </>
        )}
      </div>
    </div>
  );
}
