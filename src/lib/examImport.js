import { parse } from 'acorn';
import DOMPurify from 'dompurify';
import { STRUCTURE } from './academicStructure.js';

export const MAX_EXAM_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_EXAM_QUESTIONS = 1000;

const SAFE_TAGS = [
  'span', 'div', 'p', 'br', 'b', 'strong', 'i', 'em', 'sub', 'sup',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img',
];
const SAFE_ATTR = ['class', 'style', 'alt', 'src', 'dir', 'colspan', 'rowspan'];
const SAFE_STYLE_PROPERTIES = new Set([
  'color', 'background', 'background-color', 'font-size', 'font-weight', 'font-style',
  'text-align', 'direction', 'border', 'border-color', 'border-width', 'border-style',
  'border-collapse', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'width', 'max-width',
  'height', 'max-height', 'vertical-align', 'white-space', 'text-decoration', 'overflow-x', 'border-radius',
  'display', 'flex-wrap', 'flex-direction', 'flex', 'justify-content', 'align-items', 'gap',
  'column-gap', 'row-gap', 'line-height', 'grid-template-columns',
]);
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+=*$/i;

function fail(message) {
  throw new Error(message);
}

function evaluateLiteral(node, context) {
  switch (node?.type) {
    case 'Literal':
      if (typeof node.value === 'string' || typeof node.value === 'boolean' || node.value === null) return node.value;
      if (typeof node.value === 'number' && Number.isFinite(node.value)) return node.value;
      return fail(`${context}: unsupported literal`);
    case 'TemplateLiteral':
      if (node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? '';
      return fail(`${context}: interpolated template strings are executable expressions`);
    case 'ArrayExpression':
      return node.elements.map((element, index) => {
        if (!element || element.type === 'SpreadElement') fail(`${context}[${index}]: unsupported array expression`);
        return evaluateLiteral(element, `${context}[${index}]`);
      });
    case 'ObjectExpression': {
      const object = Object.create(null);
      for (const property of node.properties) {
        if (property.type !== 'Property' || property.kind !== 'init' || property.method || property.computed) {
          fail(`${context}: unsupported object expression`);
        }
        const key = property.key.type === 'Identifier' ? property.key.name : property.key.value;
        if (typeof key !== 'string' || key === '__proto__' || key === 'constructor' || key === 'prototype') {
          fail(`${context}: unsupported object key`);
        }
        if (Object.hasOwn(object, key)) fail(`${context}: duplicate key "${key}"`);
        object[key] = evaluateLiteral(property.value, `${context}.${key}`);
      }
      return object;
    }
    default:
      return fail(`${context}: executable or unsupported expression (${node?.type || 'missing'})`);
  }
}

function extractExamSource(html) {
  const scriptBlocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map((match) => match[1]);
  const bankCandidates = [];
  const sectionMapCandidates = [];
  const declarations = new Map();
  let sawBankDeclaration = false;
  for (const script of scriptBlocks) {
    let ast;
    try {
      ast = parse(script, { ecmaVersion: 'latest', sourceType: 'script' });
    } catch {
      if (/\b(?:const|let|var)\s+questionBanksByGrade\s*=/.test(script)) {
        fail('questionBanksByGrade script contains malformed JavaScript');
      }
      continue;
    }

    for (const statement of ast.body) {
      if (statement.type !== 'VariableDeclaration') continue;
      for (const declarator of statement.declarations) {
        if (declarator.id?.type !== 'Identifier') continue;
        declarations.set(declarator.id.name, declarator.init);
        if (declarator.id.name === 'questionBanksByGrade') {
          sawBankDeclaration = true;
          if (declarator.init?.type !== 'ObjectExpression') fail('questionBanksByGrade must be an object literal');
          bankCandidates.push(declarator.init);
        }
        if (declarator.id.name === 'sectionQuestionsMap') sectionMapCandidates.push(declarator.init);
      }
    }
  }

  if (bankCandidates.length > 0) {
    if (bankCandidates.length !== 1) fail('HTML must contain exactly one questionBanksByGrade assignment');
    return { kind: 'banks', banks: evaluateLiteral(bankCandidates[0], 'questionBanksByGrade') };
  }
  if (sectionMapCandidates.length > 0) {
    if (sectionMapCandidates.length !== 1) fail('HTML must contain exactly one sectionQuestionsMap assignment');
    const sectionMap = sectionMapCandidates[0];
    if (sectionMap?.type !== 'ObjectExpression') fail('sectionQuestionsMap must be a static object literal');
    const sectionProperties = sectionMap.type === 'ObjectExpression' ? sectionMap.properties : [];
    const questionGroups = [];
    for (const property of sectionProperties) {
      if (property.type !== 'Property') fail('sectionQuestionsMap must map section names to static question arrays');
      const staticProperty = /** @type {import('estree').Property} */ (property);
      if (staticProperty.kind !== 'init' || staticProperty.method || staticProperty.computed) {
        fail('sectionQuestionsMap must map section names to static question arrays');
      }
      const sectionName = staticProperty.key.type === 'Identifier'
        ? staticProperty.key.name
        : staticProperty.key.type === 'Literal' && typeof staticProperty.key.value === 'string'
          ? staticProperty.key.value
          : fail('sectionQuestionsMap contains an invalid section name');
      if (staticProperty.value.type !== 'Identifier') fail('sectionQuestionsMap must map section names to static question arrays');
      const arrayName = /** @type {import('estree').Identifier} */ (staticProperty.value).name;
      const sourceArray = declarations.get(arrayName);
      if (sourceArray?.type !== 'ArrayExpression') fail(`${sectionName}: section must reference a static question array`);
      const sectionQuestions = evaluateLiteral(sourceArray, arrayName);
      if (!Array.isArray(sectionQuestions)) fail(`${sectionName}: section questions must be an array`);
      const namespacedQuestions = sectionQuestions.map((question, index) => ({
        ...question,
        id: `${sectionName}-${question?.id ?? index + 1}`,
      }));
      questionGroups.push({ groupKey: sectionName, questions: namespacedQuestions });
    }
    if (!questionGroups.some((group) => group.questions.length)) fail('sectionQuestionsMap contains no questions');
    return { kind: 'sections', questionGroups };
  }
  if (!sawBankDeclaration) fail('HTML is missing a supported question bank or sectionQuestionsMap assignment');
  fail('HTML must contain exactly one questionBanksByGrade assignment');
}

function sanitizeStyle(style) {
  const value = String(style || '').trim();
  if (!value) return '';
  if (/url\s*\(|expression\s*\(|@import|[{}<>]/i.test(value)) fail('unsafe inline style');
  const declarations = value.split(';').map((declaration) => declaration.trim()).filter(Boolean);
  const safeDeclarations = [];
  for (const declaration of declarations) {
    const separator = declaration.indexOf(':');
    if (separator < 1) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const propertyValue = declaration.slice(separator + 1).trim();
    if (!SAFE_STYLE_PROPERTIES.has(property) || !propertyValue || !/^[#(),.%\w\s-]+$/u.test(propertyValue)) {
      continue;
    }
    safeDeclarations.push(`${property}: ${propertyValue}`);
  }
  return safeDeclarations.join('; ');
}

function sanitizeRichHtml(value, context) {
  const source = String(value ?? '');
  if (!source.includes('<')) return source;
  const clean = DOMPurify.sanitize(source, {
    ALLOWED_TAGS: SAFE_TAGS,
    ALLOWED_ATTR: SAFE_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https:\/\/|data:image\/(?:png|jpeg|gif|webp);base64,|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    RETURN_DOM_FRAGMENT: true,
  });
  const container = document.createElement('div');
  container.append(clean);
  for (const element of Array.from(container.querySelectorAll('*'))) {
    if (element.hasAttribute('style')) element.setAttribute('style', sanitizeStyle(element.getAttribute('style')));
    if (element.tagName === 'IMG') {
      const src = element.getAttribute('src') || '';
      if (!(src.startsWith('https://') || SAFE_DATA_IMAGE.test(src))) element.removeAttribute('src');
      if (src.startsWith('data:') && src.length > 1_500_000) fail(`${context}: embedded image is too large`);
      element.setAttribute('loading', 'lazy');
      element.setAttribute('referrerpolicy', 'no-referrer');
    }
  }
  return container.innerHTML;
}

function normalizeQuestion(question, bankKey, questionIndex) {
  const context = `${bankKey}, question ${questionIndex + 1}`;
  if (!question || typeof question !== 'object' || Array.isArray(question)) fail(`${context}: expected an object`);
  const qArValue = typeof question.qAr === 'string' ? question.qAr.trim() : '';
  const qEnValue = typeof question.qEn === 'string' ? question.qEn.trim() : '';
  const qAr = qArValue || qEnValue;
  if (!qAr) fail(`${context}: question text is required in Arabic or English`);
  if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 6) {
    fail(`${context}: expected 2 to 6 options`);
  }
  const answer = question.answer;
  if (!Number.isInteger(answer) || answer < 0 || answer >= question.options.length) fail(`${context}: answer index is outside the option list`);
  const options = question.options.map((option, optionIndex) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) fail(`${context}, option ${optionIndex + 1}: expected an object`);
    const arValue = typeof option.ar === 'string' ? option.ar.trim() : '';
    const enValue = typeof option.en === 'string' ? option.en.trim() : '';
    const ar = arValue || enValue;
    if (!ar) fail(`${context}, option ${optionIndex + 1}: option text is required in Arabic or English`);
    return {
      ar: sanitizeRichHtml(ar, `${context}, option ${optionIndex + 1}`),
      ...(enValue || arValue ? { en: sanitizeRichHtml(enValue || arValue, `${context}, option ${optionIndex + 1}`) } : {}),
    };
  });
  return {
    id: typeof question.id === 'string' && question.id.trim() ? question.id.trim().slice(0, 100) : `${bankKey}-${questionIndex + 1}`,
    qAr: sanitizeRichHtml(qAr, context),
    ...(qEnValue || qArValue ? { qEn: sanitizeRichHtml(qEnValue || qArValue, context) } : {}),
    ...(typeof question.mediaHtml === 'string' && question.mediaHtml.trim() ? { mediaHtml: sanitizeRichHtml(question.mediaHtml, `${context}, media`) } : {}),
    options,
    answer,
  };
}

function normalizeQuestionList(questions, bankKey) {
  if (!Array.isArray(questions) || !questions.length) fail(`${bankKey}: bank must contain at least one question`);
  const normalized = questions.map((question, index) => normalizeQuestion(question, bankKey, index));
  const ids = normalized.map((question) => question.id);
  if (new Set(ids).size !== ids.length) fail(`${bankKey}: question IDs must be unique within a bank`);
  return normalized;
}

function validateBanks(rawBanks) {
  if (!rawBanks || typeof rawBanks !== 'object' || Array.isArray(rawBanks)) fail('questionBanksByGrade must be an object');
  const keys = Object.keys(rawBanks);
  if (!keys.length) fail('questionBanksByGrade contains no banks');
  const banks = Object.create(null);
  let count = 0;
  for (const key of keys) {
    const match = /^(10|11|12)-(.+)$/.exec(key);
    if (!match || !STRUCTURE[match[1]]?.[match[2]]) fail(`unsupported grade/track bank "${key}"`);
    const questions = rawBanks[key];
    if (!Array.isArray(questions) || !questions.length) fail(`${key}: bank must contain at least one question`);
    count += questions.length;
    if (count > MAX_EXAM_QUESTIONS) fail(`exam exceeds ${MAX_EXAM_QUESTIONS} questions`);
    banks[key] = normalizeQuestionList(questions, key);
  }
  return { banks, bankSummaries: keys.map((key) => ({ bankKey: key, questionCount: banks[key].length })) };
}

export function sanitizeExamBanks(rawBanks) {
  return validateBanks(rawBanks).banks;
}

export function sanitizePublicExamQuestion(question, bankKey, questionIndex) {
  const normalized = normalizeQuestion({ ...question, answer: 0 }, bankKey, questionIndex);
  const { answer: _answer, ...publicQuestion } = normalized;
  return publicQuestion;
}

export function parseExamHtml(html, filename = 'exam.html') {
  if (typeof html !== 'string') fail('HTML file content must be text');
  if (new TextEncoder().encode(html).byteLength > MAX_EXAM_FILE_BYTES) fail('HTML file exceeds 5 MiB');
  if (!/\.html?$/i.test(filename)) fail('Choose an HTML file');
  const source = extractExamSource(html);
  if (source.kind === 'banks') return validateBanks(source.banks);
  const questionGroups = source.questionGroups.map(({ groupKey, questions }) => ({
    groupKey,
    questions: normalizeQuestionList(questions, groupKey),
  }));
  const questions = normalizeQuestionList(questionGroups.flatMap((group) => group.questions), 'exam');
  if (questions.length > MAX_EXAM_QUESTIONS) fail(`exam exceeds ${MAX_EXAM_QUESTIONS} questions`);
  return {
    banks: Object.create(null),
    generalQuestions: questions,
    questionGroups,
    bankSummaries: [{ bankKey: 'الاختبار كاملاً', questionCount: questions.length }],
  };
}
