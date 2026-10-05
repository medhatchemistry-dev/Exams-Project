import React from 'react';
import QuestionCard from '@/components/quiz/QuestionCard';

const ANSWER_MARKERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function ExamPreview({ questions }) {
  return (
    <section className="space-y-4 rounded-2xl border p-4" style={{ borderColor: 'var(--mol-line-strong)' }}>
      <header>
        <h4 className="font-extrabold">معاينة عرض الطالب</h4>
        <p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>
          هذه هي الأسئلة والخيارات التي ستظهر للطالب بعد التفعيل.
        </p>
      </header>

      <div className="max-h-[56vh] space-y-4 overflow-y-auto p-1">
        {questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            q={question}
            index={index}
            selected={null}
            disabled
            onSelect={() => {}}
          />
        ))}
      </div>

      <details className="rounded-xl border p-3" style={{ borderColor: 'var(--mol-line-strong)' }}>
        <summary className="cursor-pointer font-extrabold">مفتاح الإجابة للمعلم</summary>
        <ol className="mt-3 space-y-2 text-sm font-bold">
          {questions.map((question, index) => {
            const correct = question.options[question.answer];
            return (
              <li key={question.id}>
                <span>السؤال {index + 1}: {Number.isInteger(question.answer) ? (ANSWER_MARKERS[question.answer] || question.answer + 1) : 'مفتاح الإجابة غير محدد'}</span>
                {correct?.ar && <span className="ms-2" style={{ color: 'var(--mol-muted)' }}>{correct.ar}</span>}
              </li>
            );
          })}
        </ol>
      </details>
    </section>
  );
}
