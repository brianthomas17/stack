# Stack installer for Windows.
#   irm <friends server>/install.ps1 | iex
# Safe to run again: it updates an existing install instead of starting over.
$ErrorActionPreference = 'Stop'

$Repo    = if ($env:STACK_REPO)     { $env:STACK_REPO }     else { 'https://github.com/brianthomas17/stack.git' }
$AppDir  = if ($env:STACK_APP_DIR)  { $env:STACK_APP_DIR }  else { Join-Path $env:USERPROFILE '.stack-app' }
$DataDir = if ($env:STACK_DATA_DIR) { $env:STACK_DATA_DIR } else { Join-Path $env:USERPROFILE 'StackData' }
$Port    = if ($env:STACK_PORT)     { $env:STACK_PORT }     else { '4747' }
$NodeMin = 22

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Green }
function Fail($text) {
  Write-Host "`nStopped: $text" -ForegroundColor Red
  # Under `irm | iex` a plain exit would close the user's window; throw instead.
  throw $text
}
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

Write-Host 'Installing Stack' -ForegroundColor White

Step "Checking what's already here"

if (-not (Has 'git')) {
  Fail 'Git is not installed. Get it from https://git-scm.com/download/win (the defaults are fine), then open a new PowerShell window and run this command again.'
}

if (-not (Has 'node')) {
  Fail 'Node.js is not installed. Download the LTS version from https://nodejs.org, install it, then open a new PowerShell window and run this command again.'
}
$nodeMajor = [int]((node -p 'process.versions.node.split(".")[0]').Trim())
if ($nodeMajor -lt $NodeMin) {
  Fail "Node.js $NodeMin or newer is needed (you have $(node -v)). Get the LTS version from https://nodejs.org, then run this again."
}
Write-Host "Node $(node -v)"

$localBin = Join-Path $env:USERPROFILE '.local\bin'
if (-not (Has 'claude') -and -not (Test-Path (Join-Path $localBin 'claude.exe'))) {
  Write-Host "Claude Code isn't installed. Stack uses it for research and chat, on your own Claude subscription."
  $reply = Read-Host 'Install Claude Code now? [Y/n]'
  if ($reply -notmatch '^[nN]') {
    Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
  } else {
    Write-Host 'Skipping. Stack still tracks your stack and friends; research and chat need Claude Code.'
  }
}
# A fresh Claude Code install isn't on this window's PATH yet.
if ($env:Path -notlike "*$localBin*") { $env:Path = "$localBin;$env:Path" }

Step 'Getting Stack'
if (Test-Path (Join-Path $AppDir '.git')) {
  git -C $AppDir pull --ff-only -q
  Write-Host "Updated $AppDir"
} else {
  git clone -q $Repo $AppDir
  Write-Host "Downloaded to $AppDir"
}

Step 'Installing (this takes a minute)'
Set-Location $AppDir
# npm.cmd, not npm: the npm.ps1 shim can be blocked by PowerShell's script policy.
npm.cmd install --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) { Fail 'npm install failed. Scroll up for the reason.' }
npm.cmd run build --silent | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'Building Stack failed. Scroll up for the reason.' }

New-Item -ItemType Directory -Force $DataDir | Out-Null
$envFile = Join-Path $AppDir '.env'
if (-not (Test-Path $envFile)) {
  # Forward slashes keep the path intact when Node reads .env.
  $dataPath = $DataDir -replace '\\', '/'
  Set-Content -Path $envFile -Encoding ascii -Value @(
    "STACK_DATA_DIR=$dataPath",
    "STACK_API_PORT=$Port",
    'STACK_INSTALLED=1'
  )
}

if ($env:STACK_NO_SERVICE -eq '1') {
  Step 'Done (no background service, as requested)'
  Write-Host "Start it with: cd `"$AppDir`"; npm.cmd start"
  return
}

Step 'Setting Stack to run in the background'
# Stop a copy that's already running, so the new one can take the port.
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.CommandLine -like '*run-windows.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

# A tiny launcher in the Startup folder runs Stack hidden at every sign-in.
# No admin rights needed, and no console window.
$runner = Join-Path $AppDir 'install\run-windows.ps1'
$startup = [Environment]::GetFolderPath('Startup')
$vbs = Join-Path $startup 'Stack.vbs'
$cmd = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""$runner"""
Set-Content -Path $vbs -Encoding ascii -Value "CreateObject(""WScript.Shell"").Run ""$($cmd -replace '"', '""')"", 0, False"
Start-Process wscript.exe -ArgumentList "`"$vbs`""

Step 'Starting'
$up = $false
for ($i = 0; $i -lt 90; $i++) {
  try {
    Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/api/health" -TimeoutSec 2 | Out-Null
    $up = $true
    break
  } catch {
    Start-Sleep -Seconds 1
  }
}
if (-not $up) { Fail "Stack didn't start. Details are in $env:LOCALAPPDATA\Stack\stack.log" }

$url = "http://localhost:$Port"
if ($env:STACK_INVITE) { $url = "$url/#join=$env:STACK_INVITE" }
Start-Process $url

Write-Host ''
Write-Host "Stack is running at http://localhost:$Port" -ForegroundColor White
Write-Host "Bookmark it. It starts by itself when you sign in, so there's nothing to keep open."
Write-Host "Your data lives in $DataDir"
Write-Host ''
Write-Host "To uninstall: delete `"$vbs`" and `"$AppDir`", then restart. Your data folder is left alone."
