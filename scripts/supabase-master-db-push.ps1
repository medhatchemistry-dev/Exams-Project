param(
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$projectRef = 'sbgohdehpkjfsktgdzjj'
$passwordFile = Join-Path $env:LOCALAPPDATA 'Codex\supabase-exams-master\db-password.dpapi'

if (-not (Test-Path -LiteralPath $passwordFile)) {
    throw 'The encrypted exams-master database password is missing from this Windows user profile.'
}

$securePassword = Get-Content -LiteralPath $passwordFile -Raw | ConvertTo-SecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $databasePassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $arguments = @('db', 'push', '--project-ref', $projectRef, '--password', $databasePassword)
    if (-not $Apply) { $arguments += '--dry-run' }
    & supabase @arguments
    exit $LASTEXITCODE
}
finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    $databasePassword = $null
}
