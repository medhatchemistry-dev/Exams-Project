// Grade → Track → available Sections, mirrors the school's official class structure.
export const GRADE_LABELS = { '10': 'العاشر', '11': 'الحادي عشر', '12': 'الثاني عشر' };

export const STRUCTURE = {
  '10': { 'متقدم': ['1'] },
  '11': { 'متقدم': ['1', '2'], 'عام': ['1'] },
  '12': { 'متقدم': ['1', '2'], 'عام': ['1', '2'] }
};

export const GRADES = Object.keys(STRUCTURE);