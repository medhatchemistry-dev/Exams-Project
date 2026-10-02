import React from 'react';
import { Code2 } from 'lucide-react';

export default function SourceCodePanel() {
  return (
    <div>
      <div className="mol-card p-6 md:p-8 text-center">
        <div className="mx-auto mb-4 grid place-items-center" style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--mol-cobalt-soft)', border: '1px solid var(--mol-cobalt)' }}>
          <Code2 size={28} style={{ color: 'var(--mol-cobalt)' }} />
        </div>
        <h2 className="text-lg font-extrabold mb-1">الكود المصدري للتطبيق</h2>
        <p className="text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>
          تتم إدارة ملفات المشروع من مستودع GitHub الخاص بالتطبيق.
        </p>
      </div>
    </div>
  );
}
