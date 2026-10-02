const designs = [
  ['ذهبي ملكي', '#9a6b17', '#fffaf0', '#ead8ad', '✦'],
  ['زمرد علمي', '#08745c', '#f2fbf7', '#b9e2d3', '❖'],
  ['أزرق أكاديمي', '#2859a5', '#f4f8ff', '#c8d8f2', '✧'],
  ['عنابي رسمي', '#8c2945', '#fff5f6', '#e9c3cc', '❋'],
  ['بنفسجي مميز', '#6845a3', '#faf7ff', '#d9c9f0', '✦'],
  ['فيروزي هادئ', '#087e8b', '#f1fcfd', '#bde5e8', '◇'],
  ['أخضر زيتوني', '#68752d', '#fafbef', '#dce2b8', '❀'],
  ['وردي أنيق', '#ae4f79', '#fff6fa', '#f0cddd', '✿'],
  ['نحاسي كلاسيكي', '#a4532b', '#fff8f1', '#edc9ad', '✥'],
  ['ليلي داكن', '#34446f', '#f5f6ff', '#cbd1e5', '☾'],
  ['أزرق ملكي', '#174f77', '#f2faff', '#bad9eb', '✧'],
  ['مرجاني مشرق', '#bd5149', '#fff6f2', '#f1c4ba', '✺'],
  ['فضي متألق', '#586579', '#f8fafc', '#d3dbe5', '✦'],
  ['لافندر ناعم', '#76568f', '#faf6fc', '#dfcfe9', '❋'],
  ['أزرق سماوي', '#317b9b', '#f1fbff', '#c2e5f1', '☼'],
  ['أخضر غابة', '#286146', '#f3faf4', '#c0ddc8', '❖'],
  ['رمل الصحراء', '#a47a35', '#fffbf3', '#ead9b3', '✥'],
  ['أحمر ياقوتي', '#a42e3b', '#fff5f5', '#ecc3c6', '✺'],
  ['كحلي فضي', '#273d57', '#f5f8fb', '#cbd8e5', '◇'],
  ['أرجواني فاخر', '#7a3c70', '#fff6fc', '#e8c9e0', '✿'],
];

export const CERTIFICATE_TEMPLATES = designs.map(([name, accent, background, frame, symbol], index) => ({
  id: index + 1,
  name,
  accent,
  background,
  frame,
  symbol,
}));

export function getCertificateTemplate(templateId) {
  return CERTIFICATE_TEMPLATES.find((template) => template.id === Number(templateId)) || CERTIFICATE_TEMPLATES[0];
}
