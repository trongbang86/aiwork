$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.Security
$protected = [Convert]::FromBase64String((Get-Content -Raw (Join-Path $root 'data\api-token.dpapi')).Trim())
$plain = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
$env:AIWORK_API_TOKEN = [Text.Encoding]::UTF8.GetString($plain)
[Array]::Clear($plain, 0, $plain.Length)
$node = 'D:\workspace\.tools\node-v24.19.0-win-x64\node.exe'
if (!(Test-Path -LiteralPath $node)) { $node = (Get-Command node -ErrorAction Stop).Source }
$env:NODE_ENV = 'production'
$env:HOST = '0.0.0.0'
$env:PORT = '8446'
$env:AIWORK_DATABASE = Join-Path $root 'data\aiwork.db'
$env:AIWORK_TLS_CERT = 'D:\workspace\iqprep\data\tls\iqprep.crt'
$env:AIWORK_TLS_KEY = 'D:\workspace\iqprep\data\tls\iqprep.key'
$env:AIWORK_ORIGIN = 'https://192.168.0.50:8446'
Set-Location $root
& $node (Join-Path $root 'apps\api\dist\src\server.js')
exit $LASTEXITCODE
