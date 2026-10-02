alter table public.students
  add column full_name_ar text,
  add column full_name_en text;

update public.students
set full_name_ar = full_name
where full_name_ar is null;

alter table public.exams
  add column certificate_template_id smallint not null default 1
    check (certificate_template_id between 1 and 20);

create or replace function public.resolve_exam_access_code(candidate text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_code public.exam_access_codes;
  matched_exam public.exams;
begin
  if candidate is null or length(candidate) not between 1 and 64 then
    return jsonb_build_object('valid', false);
  end if;

  select * into matched_code
  from public.exam_access_codes
  where code = candidate
    and is_active
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  if matched_code.exam_id is null then
    return jsonb_build_object('valid', true, 'legacy', true);
  end if;

  select * into matched_exam
  from public.exams
  where id = matched_code.exam_id and status = 'available';

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  return jsonb_build_object(
    'valid', true,
    'legacy', false,
    'examId', matched_exam.id,
    'examTitle', matched_exam.title,
    'certificateTemplateId', matched_exam.certificate_template_id,
    'banks', matched_exam.banks
  );
end;
$$;

revoke all on function public.resolve_exam_access_code(text) from public, anon, authenticated;
grant execute on function public.resolve_exam_access_code(text) to service_role;
