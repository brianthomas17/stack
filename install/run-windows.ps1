# Keeps Stack running on Windows. Started hidden at sign-in by Stack.vbs in the
# Startup folder. If Stack exits (it does after an update), start it again.
$app = Split-Path -Parent $PSScriptRoot
Set-Location $app

$logDir = Join-Path $env:LOCALAPPDATA 'Stack'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir 'stack.log'

# Claude Code's native installer puts claude.exe here.
$localBin = Join-Path $env:USERPROFILE '.local\bin'
if ($env:Path -notlike "*$localBin*") { $env:Path = "$localBin;$env:Path" }

while ($true) {
  & npm.cmd start *>> $log
  Start-Sleep -Seconds 3
}
