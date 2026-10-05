import React from 'react';
import { Check } from 'lucide-react';
import MathText from './MathText';

const MARKERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function QuestionCard({ q, index, selected, onSelect, disabled = false }) {
  return (
    <div
      id={`q-${index}`}
      className="mol-card mol-fade-up p-5 md:p-7 scroll-mt-28"
      style={{ animationDelay: `${Math.min(index * 0.03, 0.3)}s` }}
    >
      <div className="flex items-start gap-3 mb-4">
        <div
          className="flex-0 grid place-items-center mt-1"
          style={{
            minWidth: 40, height: 40, borderRadius: 12,
            background: 'var(--mol-red-soft)', border: '1px solid var(--mol-red)',
            color: 'var(--mol-red)', fontFamily: "'Instrument Serif', serif", fontSize: 20
          }}
        >
          {index + 1}
        </div>
        <div className="flex-1">
          <div className="text-xs font-extrabold tracking-wider mb-1" style={{ color: 'var(--mol-muted)' }}>
            السؤال {index + 1} • {q.id || ''}
          </div>
          <h3 className="text-lg md:text-xl font-extrabold leading-relaxed" style={{ color: 'var(--mol-text)' }}>
            <MathText>{q.qAr}</MathText>
          </h3>
          {q.qEn && (
            <p className="text-lg md:text-xl font-extrabold mt-1" style={{ color: 'var(--mol-text)', direction: 'ltr', textAlign: 'right' }}>
              <MathText>{q.qEn}</MathText>
            </p>
          )}
        </div>
      </div>

      {q.mediaHtml && (
        <div className="my-4 flex justify-center q-media">
          <MathText>{q.mediaHtml}</MathText>
        </div>
      )}

      <div className="grid gap-3 mt-4">
        {q.options.map((opt, optIdx) => {
          const isSel = selected === optIdx;
          return (
            <button
              type="button"
              key={optIdx}
              className={`reaction-tile ${isSel ? 'is-selected' : ''}`}
              disabled={disabled}
              onClick={() => onSelect(index, optIdx)}
            >
              <span className="tile-marker">{MARKERS[optIdx] || optIdx + 1}</span>
              <span className="option-translations flex-1" dir="ltr">
                <span className="option-english text-left text-sm font-semibold" dir="ltr" style={{ color: 'var(--mol-muted)' }}>
                  {opt.en ? <MathText>{opt.en}</MathText> : <span className="italic">English translation unavailable</span>}
                </span>
                <span className="option-arabic text-right font-extrabold" dir="rtl"><MathText>{opt.ar}</MathText></span>
              </span>
              {isSel && <Check size={20} style={{ color: 'var(--mol-green)', flex: '0 0 auto' }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
