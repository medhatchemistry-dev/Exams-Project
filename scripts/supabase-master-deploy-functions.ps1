$ErrorActionPreference = 'Stop'
$projectRef = 'sbgohdehpkjfsktgdzjj'

& supabase functions deploy validate-exam-code teacher-login verify-exam-reentry --project-ref $projectRef --no-verify-jwt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& supabase functions deploy jev-import-assist --project-ref $projectRef
exit $LASTEXITCODE
