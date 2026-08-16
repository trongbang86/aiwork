#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$nssm = 'D:\filebrowser\nssm.exe'
if (!(Test-Path -LiteralPath $nssm)) { throw 'NSSM not found' }
$service = Get-Service -Name 'WorkspaceAIWork' -ErrorAction SilentlyContinue
if (!$service) { & $nssm install WorkspaceAIWork "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\run-service.ps1`"" }
& $nssm set WorkspaceAIWork AppDirectory $root
& $nssm set WorkspaceAIWork Start SERVICE_AUTO_START
& $nssm set WorkspaceAIWork ObjectName LocalSystem
& $nssm set WorkspaceAIWork AppStdout (Join-Path $root 'data\service.log')
& $nssm set WorkspaceAIWork AppStderr (Join-Path $root 'data\service-error.log')
sc.exe failure WorkspaceAIWork reset= 86400 actions= restart/5000/restart/15000/none/0
if (!(Get-NetFirewallRule -DisplayName 'AIWork HTTPS' -ErrorAction SilentlyContinue)) { New-NetFirewallRule -DisplayName 'AIWork HTTPS' -Direction Inbound -Protocol TCP -LocalPort 8446 -Action Allow | Out-Null }
Start-Service WorkspaceAIWork
