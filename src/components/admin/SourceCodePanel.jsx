import React from 'react';
import { Code2, FileArchive } from 'lucide-react';

const DOWNLOAD_URL = 'https://base44.app/api/apps/6abdf2686e18f16c1371ba52/files/mp/public/6abdf2686e18f16c1371ba52/460f6f356_source-codetar.gz';

export default function SourceCodePanel() {
  return (
    <div>
      <div className="mol-card p-6 md:p-8 text-center">
        <div className="mx-auto mb-4 grid place-items-center" style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--mol-cobalt-soft)', border: '1px solid var(--mol-cobalt)' }}>
          <Code2 size={28} style={{ color: 'var(--mol-cobalt)' }} />
        </div>
        <h2 className="text-lg font-extrabold mb-1">الكود المصدري للتطبيق</h2>
        <p className="text-sm font-bold mb-5" style={{ color: 'var(--mol-muted)' }}>
          يحتوي على كامل الكود الأمامي (Frontend) والخلفي (Backend) للملفات الأساسية
        </p>
        <a
          href={DOWNLOAD_URL}
          download="source-code.tar.gz"
          className="mol-btn mol-btn-primary inline-flex items-center gap-2 px-6 py-3"
        >
          <FileArchive size={18} /> تحميل الكود المصدري (TAR.GZ)
        </a>
      </div>
    </div>
  );
}
