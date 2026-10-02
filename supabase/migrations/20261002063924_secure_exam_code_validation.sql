revoke all on function public.validate_exam_access_code(text) from public, anon, authenticated;
grant execute on function public.validate_exam_access_code(text) to service_role;
