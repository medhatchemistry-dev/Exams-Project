param(
    [switch]$Generate
)

$ErrorActionPreference = 'Stop'
$expectedProjectRef = 'sbgohdehpkjfsktgdzjj'
$projectRefPath = Join-Path $PSScriptRoot '..\supabase\.temp\project-ref'
$envPath = Join-Path $PSScriptRoot '..\.env.local'
$origin = 'https://chemistry-khalid.vercel.app'

if (-not (Test-Path -LiteralPath $projectRefPath)) {
    throw 'Supabase CLI is not linked in this checkout. Link the intended project before resetting its teacher password.'
}

$linkedProjectRef = (Get-Content -LiteralPath $projectRefPath -Raw).Trim()
if ($linkedProjectRef -ne $expectedProjectRef) {
    throw "This helper only resets the exams-master teacher password. The linked project is '$linkedProjectRef'."
}

if (-not (Test-Path -LiteralPath $envPath)) {
    throw 'The local .env.local file is required to verify the teacher login after changing the password.'
}

$envLines = Get-Content -LiteralPath $envPath
$supabaseUrl = ($envLines | Where-Object { $_ -match '^VITE_SUPABASE_URL=' } | Select-Object -First 1) -replace '^VITE_SUPABASE_URL=', ''
$publishableKey = ($envLines | Where-Object { $_ -match '^VITE_SUPABASE_PUBLISHABLE_KEY=' } | Select-Object -First 1) -replace '^VITE_SUPABASE_PUBLISHABLE_KEY=', ''
$supabaseUrl = $supabaseUrl.Trim().Trim('"').Trim("'")
$publishableKey = $publishableKey.Trim().Trim('"').Trim("'")

if ($supabaseUrl -notmatch "https://$expectedProjectRef\.supabase\.co/?$") {
    throw 'The local Supabase URL does not match the linked exams-master project.'
}
if (-not $publishableKey) {
    throw 'VITE_SUPABASE_PUBLISHABLE_KEY is missing from .env.local.'
}

$securePassword = $null
$confirmPassword = $null
$passwordPointer = [IntPtr]::Zero
$confirmPointer = [IntPtr]::Zero
$passwordText = $null
$sqlPath = $null
$databaseUpdated = $false
$passwordTextWritten = $false

try {
    if ($Generate) {
        $randomBytes = New-Object byte[] 24
        [System.Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
        $passwordText = [Convert]::ToBase64String($randomBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
        [Array]::Clear($randomBytes, 0, $randomBytes.Length)
    }
    else {
        $securePassword = Read-Host 'New teacher password (at least 16 characters)' -AsSecureString
        $confirmPassword = Read-Host 'Confirm new teacher password' -AsSecureString
        $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        $confirmPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmPassword)
        $passwordText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
        $confirmationText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmPointer)
        if ($passwordText -cne $confirmationText) {
            throw 'The two passwords do not match.'
        }
        $confirmationText = $null
    }

    if ($passwordText.Length -lt 16 -or $passwordText.Length -gt 128) {
        throw 'The teacher password must contain between 16 and 128 characters.'
    }

    $sqlPassword = $passwordText.Replace("'", "''")
    $sql = @"
insert into public.teacher_login_passwords (id, password_hash)
values (1, extensions.crypt('$sqlPassword', extensions.gen_salt('bf')))
on conflict (id) do update set password_hash = excluded.password_hash;
"@
    $sqlPath = Join-Path $env:TEMP ("teacher-password-" + [Guid]::NewGuid().ToString('N') + '.sql')
    [System.IO.File]::WriteAllText($sqlPath, $sql, [System.Text.UTF8Encoding]::new($false))

    $queryOutput = & supabase db query --linked --project-ref $expectedProjectRef --file $sqlPath --output-format json 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw 'Supabase could not update the teacher password hash. No plaintext password was written to the repository.'
    }
    $databaseUpdated = $true

    if ($Generate) {
        Write-Output "New teacher password: $passwordText"
        $passwordTextWritten = $true
    }

    $loginBody = @{ password = $passwordText } | ConvertTo-Json -Compress
    $loginResponse = Invoke-RestMethod -Uri "$supabaseUrl/functions/v1/teacher-login" -Method Post -Headers @{
        apikey = $publishableKey
        Origin = $origin
    } -ContentType 'application/json' -Body $loginBody

    if (-not $loginResponse.session.access_token -or -not $loginResponse.session.refresh_token) {
        throw 'The password hash was updated, but the login endpoint did not return a teacher session.'
    }

    try {
        $null = Invoke-WebRequest -Uri "$supabaseUrl/auth/v1/logout" -Method Post -Headers @{
            apikey = $publishableKey
            Authorization = "Bearer $($loginResponse.session.access_token)"
        } -SkipHttpErrorCheck
    }
    catch {
        Write-Warning 'Login succeeded, but the temporary verification session could not be revoked automatically.'
    }

    $loginResponse = $null
    $loginBody = $null
    Write-Output 'Teacher login verified successfully.'
}
catch {
    if ($databaseUpdated -and $Generate -and -not $passwordTextWritten) {
        Write-Output "New teacher password: $passwordText"
        $passwordTextWritten = $true
    }
    throw
}
finally {
    if ($sqlPath -and (Test-Path -LiteralPath $sqlPath)) {
        Remove-Item -LiteralPath $sqlPath -Force
    }
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    if ($confirmPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmPointer)
    }
    $passwordText = $null
    $confirmationText = $null
    $securePassword = $null
    $confirmPassword = $null
    $sqlPassword = $null
    $sql = $null
    $queryOutput = $null
    $publishableKey = $null
}
