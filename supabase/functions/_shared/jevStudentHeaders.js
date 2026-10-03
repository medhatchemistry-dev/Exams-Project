const HEADER_FIELDS = {
  student_number: 'the student identifier or student number',
  full_name_ar: 'the student full name written in Arabic',
  full_name_en: 'the student full name written in English',
  grade: 'the student school grade, such as 10, 11, or 12',
  track: 'the student academic track, such as عام or متقدم',
  section: 'the student class section, such as 1 or 2',
};

export function createHeaderMappingRequest(headers, fields) {
  if (!Array.isArray(headers) || headers.length < 1 || headers.length > 32) throw new TypeError('Provide between 1 and 32 column headers.');
  const requestedFields = fields.filter((field) => Object.hasOwn(HEADER_FIELDS, field));
  if (!requestedFields.length) throw new TypeError('No supported fields require mapping.');

  const questions = Object.fromEntries(headers.map(({ index }, offset) => [`column_${offset + 1}`, {
    type: 'choice',
    instructions: `Which one field, if any, does the spreadsheet column at headers[${offset}] represent? Use only the label meaning.`,
    criteria: {
      ...Object.fromEntries(requestedFields.map((field) => [field, HEADER_FIELDS[field]])),
      ignore: 'This column does not clearly represent any listed student field.',
    },
  }]));

  return {
    model: 'jev-latest',
    state: { headers: headers.map(({ index, label }) => ({ index, label })) },
    questions,
  };
}

export function resolveHeaderMapping(headers, answers, fields, minimumConfidence = 0.78) {
  const fieldSet = new Set(fields.filter((field) => Object.hasOwn(HEADER_FIELDS, field)));
  const headerIndexes = new Set(headers.map(({ index }) => index));
  const proposals = [];
  headers.forEach(({ index }, offset) => {
    const answer = answers?.[`column_${offset + 1}`];
    const field = answer?.choice;
    const confidence = Number(answer?.confidence);
    if (fieldSet.has(field) && headerIndexes.has(index) && Number.isFinite(confidence) && confidence >= minimumConfidence) {
      proposals.push({ index, field, confidence });
    }
  });

  proposals.sort((left, right) => right.confidence - left.confidence);
  const mapping = {};
  const usedIndexes = new Set();
  for (const proposal of proposals) {
    if (mapping[proposal.field] || usedIndexes.has(proposal.index)) continue;
    mapping[proposal.field] = proposal.index;
    usedIndexes.add(proposal.index);
  }
  return mapping;
}

export async function callJevForHeaderMapping(headers, fields, apiKey, { fetchImpl = fetch, timeoutMs = 12_000 } = {}) {
  if (!apiKey) throw new Error('EXPERIENTIAL_API_KEY is not configured.');
  const body = createHeaderMappingRequest(headers, fields);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl('https://api.experientiallabs.ai/v1/systemone', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Jev request failed with HTTP ${response.status}.`);
    const result = await response.json();
    if (!result?.answers || typeof result.answers !== 'object') throw new Error('Jev returned an invalid answer object.');
    return resolveHeaderMapping(headers, result.answers, fields);
  } finally {
    clearTimeout(timeout);
  }
}
