import React, { useEffect, useRef } from 'react';

// "Electron shell" progress visualization + question navigator.
export default function NavGrid({ total, answers, current, onJump }) {
  const scroller = useRef(null);

  useEffect(() => {
    const el = document.getElementById(`nav-${current}`);
    const sc = scroller.current;
    if (!el || !sc) return;
    // Scroll ONLY the horizontal strip — never the window (which would jump to the top/question 1)
    const scRect = sc.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const left = sc.scrollLeft + (elRect.left - scRect.left) - (scRect.width - elRect.width) / 2;
    sc.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [current]);

  const answeredCount = Object.keys(answers).length;
  const pct = total ? answeredCount / total : 0;
  const R = 26;
  const C = 2 * Math.PI * R;

  return (
    <div className="mol-card p-4 md:p-5 mb-5 sticky top-3 z-30">
      <div className="flex items-center gap-4">
        {/* progress shell */}
        <div className="relative flex-0" style={{ width: 64, height: 64 }}>
          <svg width="64" height="64" className="shell-ring">
            <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(15,23,42,0.10)" strokeWidth="6" />
            <circle
              cx="32" cy="32" r={R} fill="none" stroke="var(--mol-green)" strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct)}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="text-sm font-extrabold leading-none" style={{ color: 'var(--mol-green)' }}>
                {answeredCount}/{total}
              </div>
              <div className="text-[9px] font-bold" style={{ color: 'var(--mol-muted)' }}>إجابات</div>
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-xs font-extrabold tracking-wider mb-1.5" style={{ color: 'var(--mol-muted)' }}>
            خريطة الأسئلة — انقر للقفز
          </div>
          <div ref={scroller} className="mol-scroll flex gap-2 overflow-x-auto pb-1">
            {Array.from({ length: total }).map((_, i) => {
              const ans = answers[i] !== undefined;
              const cur = i === current;
              return (
                <button
                  key={i}
                  id={`nav-${i}`}
                  type="button"
                  className={`electron-cell ${ans ? 'answered' : ''} ${cur ? 'current' : ''}`}
                  onClick={() => onJump(i)}
                  title={`سؤال ${i + 1}`}
                >
                  <span className="dot" />
                  <span>{i + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}