import React from 'react';
import ResultsPanel from './ResultsPanel';

export default function ScoresPage() {
  return <section className="space-y-5"><header><p className="text-sm font-extrabold" style={{ color: 'var(--mol-cobalt)' }}>إدارة النتائج</p><h2 className="text-2xl font-extrabold">الدرجات</h2></header><ResultsPanel /></section>;
}
