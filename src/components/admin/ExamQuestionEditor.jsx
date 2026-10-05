import React from 'react';

export default function ExamQuestionEditor({ questions, onChange }) {
  const patchQuestion = (questionIndex, key, value) => {
    onChange(questions.map((question, index) => index === questionIndex ? { ...question, [key]: value } : question));
  };

  const patchOption = (questionIndex, optionIndex, key, value) => {
    onChange(questions.map((question, index) => index !== questionIndex ? question : {
      ...question,
      options: question.options.map((option, index) => index === optionIndex ? { ...option, [key]: value } : option),
    }));
  };

  return <section className="space-y-3" aria-label="تحرير الأسئلة والإجابات">
    <h4 className="font-extrabold">تحرير الأسئلة والإجابات</h4>
    <p className="text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>
      اكتب الترجمة الإنجليزية في العمود الأيسر والعربية في العمود الأيمن. استخدم \(…\) للمعادلة داخل السطر أو \[…\] لمعادلة مستقلة.
    </p>
    {questions.map((question, questionIndex) => <details key={question.id || questionIndex} className="mol-card p-4">
      <summary className="cursor-pointer font-extrabold">السؤال {questionIndex + 1} · {question.id || `Q${questionIndex + 1}`}</summary>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="mol-label">نص السؤال بالعربية
          <textarea className="mol-input mt-1 min-h-20" dir="rtl" value={question.qAr || ''} onChange={(event) => patchQuestion(questionIndex, 'qAr', event.target.value)} />
        </label>
        <label className="mol-label">نص السؤال بالإنجليزية
          <textarea className="mol-input mt-1 min-h-20" dir="ltr" value={question.qEn || ''} onChange={(event) => patchQuestion(questionIndex, 'qEn', event.target.value)} />
        </label>
      </div>
      {question.mediaHtml?.includes('data:image/') ? <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--mol-line-strong)' }}>
        <p className="mb-2 text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>صورة الصفحة المرفقة من ملف PDF</p>
        <div className="q-media" dangerouslySetInnerHTML={{ __html: question.mediaHtml }} />
        <button type="button" className="mol-btn mol-btn-ghost mt-2 px-3 py-1.5 text-xs" onClick={() => patchQuestion(questionIndex, 'mediaHtml', '')}>إزالة الصورة</button>
      </div> : <label className="mol-label mt-3 block">الوسائط أو الصورة (HTML آمن)
        <textarea className="mol-input mt-1 min-h-16" dir="ltr" value={question.mediaHtml || ''} onChange={(event) => patchQuestion(questionIndex, 'mediaHtml', event.target.value)} />
      </label>}
      <ol className="mt-3 space-y-3">
        {question.options.map((option, optionIndex) => <li key={optionIndex} className="rounded-xl border p-3" style={{ borderColor: 'var(--mol-line-strong)' }}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <strong>الخيار {optionIndex + 1}</strong>
            <label className="flex items-center gap-2 text-xs font-bold">
              <input type="radio" name={`answer-${question.id || questionIndex}`} checked={Number.isInteger(question.answer) && Number(question.answer) === optionIndex} onChange={() => patchQuestion(questionIndex, 'answer', optionIndex)} />
              الإجابة الصحيحة
            </label>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="mol-label">English — left
              <textarea className="mol-input mt-1 min-h-16" dir="ltr" value={option.en || ''} onChange={(event) => patchOption(questionIndex, optionIndex, 'en', event.target.value)} />
            </label>
            <label className="mol-label">العربية — اليمين
              <textarea className="mol-input mt-1 min-h-16" dir="rtl" value={option.ar || ''} onChange={(event) => patchOption(questionIndex, optionIndex, 'ar', event.target.value)} />
            </label>
          </div>
        </li>)}
      </ol>
    </details>)}
  </section>;
}
