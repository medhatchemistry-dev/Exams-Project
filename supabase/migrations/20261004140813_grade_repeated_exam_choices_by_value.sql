-- Award credit for any displayed choice whose value matches the correct value, including repeated choices.
create or replace function public.submit_exam_attempt(
  candidate_code text,
  student_name_input text,
  student_number_input text,
  grade_input text,
  track_input text,
  section_input text,
  answers_input jsonb,
  presented_questions_input jsonb,
  submission_time_input text,
  is_other_input boolean default false,
  is_auto_input boolean default false
)
returns table (
  result_id bigint,
  score integer,
  total integer,
  exam_id bigint,
  exam_title text,
  questions_json jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_code public.exam_access_codes;
  source_exam public.exams;
  source_bank jsonb;
  submitted_question jsonb;
  canonical_question jsonb;
  correct_option jsonb;
  checked_questions jsonb := '[]'::jsonb;
  computed_score integer := 0;
  question_index integer := 0;
  submitted_answer integer;
  correct_answer integer;
  inserted_id bigint;
begin
  if candidate_code is null or length(candidate_code) not between 1 and 64 then
    raise exception 'Invalid exam access code' using errcode = '22023';
  end if;
  if student_name_input is null or length(trim(student_name_input)) not between 1 and 160 then
    raise exception 'Invalid student name' using errcode = '22023';
  end if;
  if student_number_input is null or length(trim(student_number_input)) not between 1 and 80 then
    raise exception 'Invalid student number' using errcode = '22023';
  end if;
  if grade_input not in ('10', '11', '12') or track_input not in ('متقدم', 'عام') or section_input not in ('1', '2') then
    raise exception 'Invalid student class' using errcode = '22023';
  end if;
  if submission_time_input is null or length(submission_time_input) > 100 then
    raise exception 'Invalid submission time' using errcode = '22023';
  end if;
  if jsonb_typeof(answers_input) is distinct from 'object' or public.jsonb_object_length(answers_input) > 100 then
    raise exception 'Invalid answers payload' using errcode = '22023';
  end if;
  if jsonb_typeof(presented_questions_input) is distinct from 'array'
    or jsonb_array_length(presented_questions_input) < 1
    or jsonb_array_length(presented_questions_input) > 100 then
    raise exception 'Invalid question snapshot' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_object_keys(answers_input) as answer_key(key)
    where key !~ '^(0|[1-9][0-9]*)$'
      or case when key ~ '^(0|[1-9][0-9]*)$' then key::integer >= jsonb_array_length(presented_questions_input) else true end
  ) then
    raise exception 'Answer index is outside the question list' using errcode = '22023';
  end if;

  if (select count(distinct value->>'id') from jsonb_array_elements(presented_questions_input))
    <> jsonb_array_length(presented_questions_input) then
    raise exception 'Question IDs must be unique' using errcode = '22023';
  end if;

  select * into active_code
  from public.exam_access_codes
  where code = candidate_code
    and is_active
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1
  for update;
  if not found then
    raise exception 'Exam access code is inactive or expired' using errcode = '22023';
  end if;
  if active_code.exam_id is null then
    raise exception 'Legacy codes use client-scored submission' using errcode = '22023';
  end if;

  select * into source_exam
  from public.exams
  where id = active_code.exam_id and status = 'available'
  for share;
  if not found then
    raise exception 'Exam is unavailable' using errcode = '22023';
  end if;
  source_bank := source_exam.banks -> (grade_input || '-' || track_input);
  if jsonb_typeof(source_bank) is distinct from 'array' then
    raise exception 'Exam has no matching grade/track bank' using errcode = '22023';
  end if;
  if jsonb_array_length(presented_questions_input) <> jsonb_array_length(source_bank) then
    raise exception 'Submitted question list does not match the exam bank' using errcode = '22023';
  end if;

  for submitted_question in select value from jsonb_array_elements(presented_questions_input)
  loop
    question_index := question_index + 1;
    if jsonb_typeof(submitted_question) is distinct from 'object' or submitted_question ? 'answer' then
      raise exception 'Invalid public question snapshot' using errcode = '22023';
    end if;
    if jsonb_typeof(submitted_question->'id') is distinct from 'string' then
      raise exception 'Question identifier missing' using errcode = '22023';
    end if;

    select question into canonical_question
    from jsonb_array_elements(source_bank) as bank(question)
    where bank.question->>'id' = submitted_question->>'id'
    limit 1;
    if canonical_question is null then
      raise exception 'Question is not part of this exam' using errcode = '22023';
    end if;
    if jsonb_typeof(submitted_question->'options') is distinct from 'array'
      or jsonb_array_length(submitted_question->'options') <> jsonb_array_length(canonical_question->'options') then
      raise exception 'Submitted option set does not match the exam' using errcode = '22023';
    end if;

    if (
      select array_agg(value::text order by value::text)
      from jsonb_array_elements(canonical_question->'options') as canonical_option(value)
    ) is distinct from (
      select array_agg(value::text order by value::text)
      from jsonb_array_elements(submitted_question->'options') as submitted_option(value)
    ) then
      raise exception 'Submitted options were modified' using errcode = '22023';
    end if;

    correct_answer := (canonical_question->>'answer')::integer;
    select option.value into correct_option
    from jsonb_array_elements(canonical_question->'options') with ordinality as option(value, position)
    where option.position = correct_answer + 1;
    select option.position - 1 into correct_answer
    from jsonb_array_elements(submitted_question->'options') with ordinality as option(value, position)
    where option.value = correct_option;

    submitted_answer := null;
    if answers_input ? (question_index - 1)::text then
      if (answers_input->>(question_index - 1)::text) !~ '^(0|[1-9][0-9]*)$' then
        raise exception 'Invalid answer option index' using errcode = '22023';
      end if;
      submitted_answer := (answers_input->>(question_index - 1)::text)::integer;
      if submitted_answer >= jsonb_array_length(submitted_question->'options') then
        raise exception 'Invalid answer option index' using errcode = '22023';
      end if;
    end if;

    if submitted_answer is not null
      and submitted_question->'options'->submitted_answer = correct_option then
      computed_score := computed_score + 1;
    end if;
    checked_questions := checked_questions || jsonb_build_array(
      submitted_question || jsonb_build_object('answer', correct_answer, 'index', question_index)
    );
  end loop;

  if is_auto_input then computed_score := 0; end if;
  insert into public.exam_results (
    student_name, student_number, grade, track, section, score, total,
    answers_json, submission_time, is_other, exam_id, exam_title_snapshot, questions_json
  ) values (
    trim(student_name_input), trim(student_number_input), grade_input, track_input, section_input,
    computed_score, question_index, answers_input, submission_time_input, coalesce(is_other_input, false),
    source_exam.id, source_exam.title, checked_questions
  ) returning id into inserted_id;

  return query select inserted_id, computed_score, question_index, source_exam.id, source_exam.title, checked_questions;
end;
$$;

revoke all on function public.submit_exam_attempt(text, text, text, text, text, text, jsonb, jsonb, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.submit_exam_attempt(text, text, text, text, text, text, jsonb, jsonb, text, boolean, boolean) to service_role;
