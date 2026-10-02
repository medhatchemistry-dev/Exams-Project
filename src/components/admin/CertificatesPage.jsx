import React from 'react';
import CertificatesPanel from './CertificatesPanel';

export default function CertificatesPage() {
  return <section className="space-y-5"><header><p className="text-sm font-extrabold" style={{ color: 'var(--mol-cobalt)' }}>إنجازات الطلاب</p><h2 className="text-2xl font-extrabold">الشهادات</h2></header><CertificatesPanel /></section>;
}
