import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// Renders Arabic/English text that may contain inline KaTeX \( ... \) and HTML spans.
// Splits on \( ... \); math segments go through katex, the rest through dangerouslySetInnerHTML
// (the source banks use <span style="color:..."> for emphasis).

// Latin/digit/formula run (incl. unicode sub/superscripts, ° ± µ · and similar)
const LTR_RUN = /[!-~\u00B0\u00B1\u00B2\u00B3\u00B9\u00B5\u00B7\u00BA\u2070-\u209F]+(?:\s+[!-~\u00B0\u00B1\u00B2\u00B3\u00B9\u00B5\u00B7\u00BA\u2070-\u209F]+)*/g;

// Wrap contiguous Latin/digit/chemical-formula runs in LTR bidi isolates so the RTL
// page direction can never mirror equations (reactants/products swapped) or push
// superscripts/subscripts to the wrong side of the base.
function isolateLtrRuns(html) {
  return html.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, text) => {
    if (tag) return tag;
    return text.replace(LTR_RUN, (run) => `<span dir="ltr" style="unicode-bidi:isolate">${run}</span>`);
  });
}

function renderMath(tex, displayMode = false) {
  try {
    return katex.renderToString(tex, { throwOnError: false, output: 'html', displayMode });
  } catch (e) {
    return tex;
  }
}

export default function MathText({ children, className = '' }) {
  if (children == null) return null;
  const text = String(children);
  const parts = [];
  const re = /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\\\(([\s\S]*?)\\\)/g;
  let last = 0;
  let m;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'html', value: text.slice(last, m.index), key: key++ });
    const display = m[1] !== undefined || m[2] !== undefined;
    parts.push({ type: 'math', value: m[1] ?? m[2] ?? m[3], display, key: key++ });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'html', value: text.slice(last), key: key++ });

  return (
    <span className={className} style={{ display: 'contents' }}>
      {parts.map((p) =>
      p.type === 'math' ? (
        p.display ? (
          <div
            key={p.key}
            dir="ltr"
            className="question-display-math"
            style={{ direction: 'ltr', unicodeBidi: 'isolate', overflowX: 'auto', textAlign: 'center' }}
            dangerouslySetInnerHTML={{ __html: renderMath(p.value, true) }}
          />
        ) : (
          <span
            key={p.key}
            dir="ltr"
            style={{ direction: 'ltr', unicodeBidi: 'isolate', display: 'inline-block' }}
            dangerouslySetInnerHTML={{ __html: renderMath(p.value) }}
          />
        )
        ) : (
          <span key={p.key} dangerouslySetInnerHTML={{ __html: isolateLtrRuns(p.value) }} />
        )
      )}
    </span>
  );
}
