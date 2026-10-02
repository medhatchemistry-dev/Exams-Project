import React, { useState } from 'react';
import { LogOut, FileBarChart, Award, Code2 } from 'lucide-react';
import ResultsPanel from './ResultsPanel';
import CertificatesPanel from './CertificatesPanel';
import SourceCodePanel from './SourceCodePanel';
import { supabase } from '@/api/supabaseClient';
import ExamAccessPanel from './ExamAccessPanel';

export default function AdminDashboard() {
  const [tab, setTab] = useState('results'); // results | certificates | source

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mol-card flex items-center justify-between p-4 md:p-5 mb-6">
        <div className="flex items-center gap-3"><img src="/logo.svg" alt="" className="h-12 w-12 object-contain" /><h1 className="text-xl font-extrabold">لوحة تحكم المعلم</h1></div>
        <button className="mol-btn mol-btn-ghost px-4 py-2 inline-flex items-center gap-2" onClick={logout}>
          <LogOut size={16} /> خروج
        </button>
      </div>

      <ExamAccessPanel />

      <div className="flex gap-3 mb-6">
        <button
          className={`mol-btn px-5 py-2.5 inline-flex items-center gap-2 ${tab === 'results' ? 'mol-btn-primary' : 'mol-btn-ghost'}`}
          onClick={() => setTab('results')}
        >
          <FileBarChart size={16} /> النتائج
        </button>
        <button
          className={`mol-btn px-5 py-2.5 inline-flex items-center gap-2 ${tab === 'certificates' ? 'mol-btn-primary' : 'mol-btn-ghost'}`}
          onClick={() => setTab('certificates')}
        >
          <Award size={16} /> الشهادات
        </button>
        <button
          className={`mol-btn px-5 py-2.5 inline-flex items-center gap-2 ${tab === 'source' ? 'mol-btn-primary' : 'mol-btn-ghost'}`}
          onClick={() => setTab('source')}
        >
          <Code2 size={16} /> الكود المصدري
        </button>
      </div>

      {tab === 'results' ? <ResultsPanel /> : tab === 'certificates' ? <CertificatesPanel /> : <SourceCodePanel />}
    </div>
  );
}
