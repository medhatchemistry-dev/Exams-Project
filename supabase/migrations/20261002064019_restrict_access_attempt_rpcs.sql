revoke all on function public.consume_access_attempt(text, text) from public, anon, authenticated;
grant execute on function public.consume_access_attempt(text, text) to service_role;
revoke all on function public.validate_exam_access_code(text) from public, anon, authenticated;
grant execute on function public.validate_exam_access_code(text) to service_role;
revoke all on function public.verify_teacher_password(text) from public, anon, authenticated;
grant execute on function public.verify_teacher_password(text) to service_role;
