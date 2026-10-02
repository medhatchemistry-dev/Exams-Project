-- Results are created only by trusted server-side grading paths.
drop policy if exists "Anyone can submit an exam result" on public.exam_results;

-- Remove the legacy broad client grants, then keep teacher result reads under RLS.
revoke all privileges on table public.exam_results from anon, authenticated;
grant select on table public.exam_results to authenticated;

-- The identity sequence is only needed by trusted server-side inserts.
revoke all privileges on sequence public.exam_results_id_seq from anon, authenticated;
