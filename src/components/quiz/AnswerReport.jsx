import React from 'react';
import MathText from './MathText';

const MARKERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// Full correction report — rendered off-screen and captured into the downloadable PDF.
// Shows the student's own answer on every question, marks it correct/wrong,
// and highlights the correct answer whenever the student answered wrong or left it blank.
export default function AnswerReport({ innerRef, student, score, total, submissionTime, questions, answers, showAnswerKey = true }) {
  const percentage = total ? (score / total) * 100 : 0;
  let correct = 0;
  let wrong = 0;
  let blank = 0;
  questions.forEach((_, i) => {
    if (answers[i] === undefined) blank++;
    else if (parseInt(answers[i], 10) === questions[i].answer) correct++;
    else wrong++;
  });

  const chip = (text, bg, color) => (
    <span style={{ fontSize: 11, fontWeight: 900, padding: '3px 10px', borderRadius: 999, background: bg, color, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );

  return (
    <div
      ref={innerRef}
      dir="rtl"
      style={{
        width: 794,
        background: '#ffffff',
        color: '#111827',
        fontFamily: "'Cairo', ui-sans-serif, sans-serif",
        padding: '36px 40px',
        boxSizing: 'border-box'
      }}
    >
      {/* header */}
      <div style={{ borderBottom: '3px solid #dc2626', paddingBottom: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>منصة لغة الكيمياء — {showAnswerKey ? 'تقرير التصحيح التفصيلي' : 'تقرير إجابات الطالب'}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginTop: 6 }}>
          {student.name} • {student.grade} ({student.track}) • شعبة {student.section} • رقم الطالب: {student.id}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginTop: 2 }}>
          الدرجة: {score} من {total} ({percentage.toFixed(1)}%) • وقت التسليم: {submissionTime}
        </div>
        {showAnswerKey ? (
          <div style={{ fontSize: 13, fontWeight: 800, marginTop: 8 }}>
            إجابات صحيحة: <span style={{ color: '#059669' }}>{correct}</span>
            {' — '}خاطئة: <span style={{ color: '#dc2626' }}>{wrong}</span>
            {' — '}لم تُجب: <span style={{ color: '#d97706' }}>{blank}</span>
          </div>
        ) : (
          <div style={{ fontSize: 13, fontWeight: 800, marginTop: 8 }}>تم احتساب الدرجة عبر الخادم. هذا التقرير لا يعرض مفاتيح الإجابة.</div>
        )}
      </div>

      {questions.map((q, i) => {
        const studentAns = answers[i];
        const isCorrect = showAnswerKey && studentAns !== undefined && parseInt(studentAns, 10) === q.answer;
        const isWrong = showAnswerKey && studentAns !== undefined && !isCorrect;
        return (
          <div
            key={i}
            data-qblock
            style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '14px 16px', marginBottom: 16, breakInside: 'avoid' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ fontWeight: 900, fontSize: 15 }}>السؤال {i + 1}</span>
              {isCorrect && chip('إجابة صحيحة ✓', '#ecfdf5', '#059669')}
              {isWrong && chip('إجابة خاطئة ✗', '#fef2f2', '#dc2626')}
              {studentAns === undefined && chip('لم تُجب', '#fffbeb', '#d97706')}
              {studentAns !== undefined && (
                <span style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>
                  إجابتك: ({MARKERS[studentAns] || studentAns + 1})
                </span>
              )}
              {showAnswerKey && !isCorrect && (
                <span style={{ fontSize: 12, fontWeight: 800, color: '#059669' }}>
                  الإجابة الصحيحة: ({MARKERS[q.answer]})
                </span>
              )}
            </div>

            <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.7 }}>
              <MathText>{q.qAr}</MathText>
            </div>
            {q.qEn && (
              <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.7, color: '#334155', direction: 'ltr', textAlign: 'right' }}>
                <MathText>{q.qEn}</MathText>
              </div>
            )}
            {q.mediaHtml && (
              <div className="q-media" style={{ textAlign: 'center', margin: '10px 0' }}>
                <MathText>{q.mediaHtml}</MathText>
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              {q.options.map((opt, oi) => {
                const isCorrectOpt = showAnswerKey && oi === q.answer;
                const isStudentOpt = studentAns === oi;
                const bg = isCorrectOpt ? '#ecfdf5' : showAnswerKey && isStudentOpt ? '#fef2f2' : isStudentOpt ? '#eff6ff' : '#ffffff';
                const bc = isCorrectOpt ? '#059669' : showAnswerKey && isStudentOpt ? '#dc2626' : isStudentOpt ? '#2563eb' : '#e2e8f0';
                return (
                  <div
                    key={oi}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '7px 12px',
                      borderRadius: 8,
                      border: `1.5px solid ${bc}`,
                      background: bg,
                      marginBottom: 6
                    }}
                  >
                    <span
                      style={{
                        minWidth: 26,
                        height: 26,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        fontWeight: 800,
                        fontSize: 13,
                        flex: '0 0 auto'
                      }}
                    >
                      {MARKERS[oi] || oi + 1}
                    </span>
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 700, lineHeight: 1.6 }}>
                      <MathText>{opt.ar}</MathText>
                    </span>
                    {opt.en && (
                      <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: '#334155', direction: 'ltr', textAlign: 'right' }}>
                        <MathText>{opt.en}</MathText>
                      </span>
                    )}
                    {isStudentOpt && (
                      <span style={{ fontSize: 11, fontWeight: 900, color: isCorrectOpt ? '#059669' : '#dc2626', whiteSpace: 'nowrap' }}>
                        إجابتك
                      </span>
                    )}
                    {showAnswerKey && isCorrectOpt && (
                      <span style={{ fontSize: 11, fontWeight: 900, color: '#059669', whiteSpace: 'nowrap' }}>الصحيحة ✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
        مدرسة خالد بن الوليد • إعداد الأستاذ محمد مدحت • منصة لغة الكيمياء
      </div>
    </div>
  );
}
