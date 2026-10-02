import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Edit3, Loader2, Plus, Search, Trash2, Upload, Users } from 'lucide-react';
import { STRUCTURE, GRADE_LABELS } from '@/lib/academicStructure';
import { downloadStudentTemplate, parseStudentWorkbook, validateStudentRows } from '@/lib/studentWorkbook';
import { deleteStudent, getExistingStudentNumbers, listStudents, saveStudent, upsertStudents } from '@/lib/studentRepository';
import StudentEditorDialog from './StudentEditorDialog';
import StudentImportDialog from './StudentImportDialog';

const PAGE_SIZE = 100;

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState('');
  const [grade, setGrade] = useState('');
  const [track, setTrack] = useState('');
  const [section, setSection] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState(null);
  const [importRows, setImportRows] = useState(null);
  const [importProgress, setImportProgress] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listStudents({ search, grade, track, section, from: page * PAGE_SIZE, pageSize: PAGE_SIZE });
      setStudents(result.rows);
      setCount(result.count);
    } catch (loadError) {
      console.error('Student roster load failed:', loadError);
      setError('تعذر تحميل سجل الطلاب. تحقق من الاتصال وصلاحية حساب المعلم.');
    } finally {
      setLoading(false);
    }
  }, [search, grade, track, section, page]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleWorkbook = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setNotice('');
    try {
      const initial = await parseStudentWorkbook(await file.arrayBuffer());
      const existing = await getExistingStudentNumbers(initial.validRows.map((row) => row.student_number));
      const preview = validateStudentRows(
        [...initial.validRows, ...initial.invalidRows.map((row) => ({ ...row.student, sourceRow: row.sourceRow }))],
        existing,
      );
      setImportRows({ ...preview, filename: file.name });
    } catch (parseError) {
      console.error('Student workbook parse failed:', parseError);
      setError(parseError.message || 'تعذر قراءة ملف Excel.');
    }
  };

  const saveImport = async () => {
    if (!importRows || importRows.invalidRows.length || !importRows.validRows.length) return;
    setSaving(true);
    setImportProgress('جارٍ رفع الصفوف…');
    setError('');
    try {
      const result = await upsertStudents(importRows.validRows, ({ batchIndex, batchCount, processed, total }) => {
        setImportProgress(`دفعة ${batchIndex} من ${batchCount} · ${processed} من ${total}`);
      });
      const updates = importRows.validRows.filter((row) => row.action === 'update').length;
      const inserts = result.processed - updates;
      setNotice(`تم حفظ ${result.processed} طالباً: ${inserts} جديد، ${updates} تحديث.`);
      setImportRows(null);
      setImportProgress('');
      setPage(0);
      await refresh();
    } catch (saveError) {
      console.error('Student workbook import failed:', saveError);
      setError(`فشل حفظ الدفعة ${saveError.batchIndex || ''}. تم حفظ ${saveError.processed || 0} صفاً قبل الخطأ. صحح السبب ثم أعد رفع الملف.`);
      setImportProgress('');
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const saveManualStudent = async (values) => {
    const result = validateStudentRows([values]);
    if (result.invalidRows.length) throw new Error(result.invalidRows[0].errors.join(' '));
    setSaving(true);
    try {
      await saveStudent(result.validRows[0], editor?.student?.id ?? null);
      setNotice(editor?.student ? 'تم تحديث بيانات الطالب.' : 'تمت إضافة الطالب.');
      setEditor(null);
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteCandidate) return;
    setSaving(true);
    setError('');
    try {
      await deleteStudent(deleteCandidate.id);
      setNotice(`تم حذف سجل ${deleteCandidate.full_name_ar || deleteCandidate.full_name}.`);
      setDeleteCandidate(null);
      await refresh();
    } catch (deleteError) {
      console.error('Student deletion failed:', deleteError);
      setError('تعذر حذف الطالب. تحقق من صلاحية حساب المعلم ثم حاول مجدداً.');
    } finally {
      setSaving(false);
    }
  };

  const tracks = grade ? Object.keys(STRUCTURE[grade] || {}) : [];
  const sections = grade && track ? STRUCTURE[grade]?.[track] || [] : [];

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm font-extrabold" style={{ color: 'var(--mol-cobalt)' }}>إدارة السجل</p><h2 className="text-2xl font-extrabold">الطلاب</h2><p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>{count} طالب مسجل</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-2 px-3 py-2" onClick={() => downloadStudentTemplate()}><Download size={16} /> قالب Excel</button>
          <label className="mol-btn mol-btn-ghost inline-flex cursor-pointer items-center gap-2 px-3 py-2"><Upload size={16} /> استيراد Excel<input className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleWorkbook} /></label>
          <button type="button" className="mol-btn mol-btn-primary inline-flex items-center gap-2 px-3 py-2" onClick={() => setEditor({ student: null })}><Plus size={16} /> إضافة طالب</button>
        </div>
      </header>

      {error && <div role="alert" className="mol-card p-4 font-bold" style={{ color: 'var(--mol-red)' }}>{error}</div>}
      {notice && <div role="status" className="mol-card p-4 font-bold" style={{ color: 'var(--mol-green)' }}>{notice}</div>}
      {importProgress && <div role="status" aria-live="polite" className="mol-card p-4 font-bold">{importProgress}</div>}

      <div className="mol-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="relative"><span className="sr-only">بحث عن طالب</span><Search className="absolute right-3 top-1/2 -translate-y-1/2" size={16} style={{ color: 'var(--mol-muted)' }} /><input className="mol-input pr-10" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="الاسم أو رقم الطالب" /></label>
        <select className="mol-input" value={grade} onChange={(event) => { setGrade(event.target.value); setTrack(''); setSection(''); setPage(0); }}><option value="">كل الصفوف</option>{Object.keys(STRUCTURE).map((value) => <option key={value} value={value}>{GRADE_LABELS[value]} ({value})</option>)}</select>
        <select className="mol-input" value={track} onChange={(event) => { setTrack(event.target.value); setSection(''); setPage(0); }} disabled={!grade}><option value="">كل المسارات</option>{tracks.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select className="mol-input" value={section} onChange={(event) => { setSection(event.target.value); setPage(0); }} disabled={!track}><option value="">كل الشعب</option>{sections.map((value) => <option key={value} value={value}>{value}</option>)}</select>
      </div>

      <div className="mol-card overflow-hidden">
        {loading ? <div className="flex items-center gap-2 p-8 font-bold" role="status"><Loader2 className="animate-spin" size={18} /> جاري تحميل سجل الطلاب…</div> : students.length === 0 ? <div className="p-10 text-center"><Users size={30} className="mx-auto mb-3" style={{ color: 'var(--mol-muted)' }} /><h3 className="font-extrabold">لا يوجد طلاب مطابقون</h3><p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>أضف طالباً جديداً أو استورد قالب Excel.</p></div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-right" style={{ borderColor: 'var(--mol-line-strong)' }}>{['رقم الطالب', 'الاسم بالعربية', 'الاسم بالإنجليزية', 'الصف', 'المسار', 'الشعبة', 'الإجراءات'].map((heading) => <th key={heading} scope="col" className="px-4 py-3 font-extrabold">{heading}</th>)}</tr></thead><tbody>{students.map((student) => <tr key={student.id} className="border-b last:border-0" style={{ borderColor: 'var(--mol-line-strong)' }}><td className="px-4 py-3 font-mono">{student.student_number}</td><td className="px-4 py-3 font-extrabold"><Link className="underline decoration-dotted underline-offset-4" to={`/admin/students/${student.id}`}>{student.full_name_ar || student.full_name}</Link></td><td className="px-4 py-3" dir="ltr">{student.full_name_en || '—'}</td><td className="px-4 py-3">{student.grade}</td><td className="px-4 py-3">{student.track}</td><td className="px-4 py-3">{student.section}</td><td className="px-4 py-3"><div className="flex gap-2"><button type="button" aria-label={`تعديل ${student.full_name_ar || student.full_name}`} className="mol-btn mol-btn-ghost p-2" onClick={() => setEditor({ student })}><Edit3 size={16} /></button><button type="button" aria-label={`حذف ${student.full_name_ar || student.full_name}`} className="mol-btn mol-btn-ghost p-2" onClick={() => setDeleteCandidate(student)}><Trash2 size={16} style={{ color: 'var(--mol-red)' }} /></button></div></td></tr>)}</tbody></table></div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3"><button type="button" className="mol-btn mol-btn-ghost px-4 py-2" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>السابق</button><span className="text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>صفحة {page + 1} من {Math.max(1, Math.ceil(count / PAGE_SIZE))}</span><button type="button" className="mol-btn mol-btn-ghost px-4 py-2" disabled={(page + 1) * PAGE_SIZE >= count || loading} onClick={() => setPage((value) => value + 1)}>التالي</button></div>

      {editor && <StudentEditorDialog student={editor.student} saving={saving} onClose={() => setEditor(null)} onSave={saveManualStudent} />}
      {importRows && <StudentImportDialog preview={importRows} saving={saving} onClose={() => setImportRows(null)} onConfirm={saveImport} />}
      {deleteCandidate && <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/50 p-4" role="presentation"><section role="alertdialog" aria-modal="true" aria-labelledby="delete-student-title" className="mol-card w-full max-w-md p-6"><h3 id="delete-student-title" className="text-lg font-extrabold">تأكيد حذف الطالب</h3><p className="mt-2 font-bold" style={{ color: 'var(--mol-muted)' }}>سيتم حذف سجل {deleteCandidate.full_name_ar || deleteCandidate.full_name} ({deleteCandidate.student_number}). هذا الإجراء لا يحذف نتائج الاختبارات السابقة.</p><div className="mt-5 flex justify-end gap-2"><button type="button" className="mol-btn mol-btn-ghost px-4 py-2" disabled={saving} onClick={() => setDeleteCandidate(null)}>إلغاء</button><button type="button" className="mol-btn px-4 py-2" disabled={saving} style={{ background: 'var(--mol-red)', color: 'white' }} onClick={confirmDelete}>{saving ? 'جارٍ الحذف…' : 'حذف الطالب'}</button></div></section></div>}
    </section>
  );
}
