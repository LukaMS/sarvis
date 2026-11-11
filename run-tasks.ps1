<#
  Runs Sarvis plan tasks back to back: one fresh Claude Code session per task
  (same effect as /clear + /next), stopping when Claude needs you.

  Run from the sarvis folder:
    powershell -ExecutionPolicy Bypass -File .\run-tasks.ps1
    powershell -ExecutionPolicy Bypass -File .\run-tasks.ps1 -MaxTasks 5 -Avd Pixel_8_API_35

  Options:
    -MaxTasks  most task sessions to run before stopping (default 10)
    -MaxTurns  turn cap per session; when hit, a fresh session resumes the task (default 120)
    -Model     optional model override, e.g. opus
    -Avd       optional Android emulator name; started automatically if no device is running
               (list yours with: emulator -list-avds)

  Ctrl+C stops it at any time. Every finished task is already committed.
#>
param(
  [int]$MaxTasks = 10,
  [int]$MaxTurns = 120,
  [string]$Model = "",
  [string]$Avd = ""
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location $PSScriptRoot

# Logs live in .claude/logs and are kept out of git
$logDir = Join-Path $PSScriptRoot ".claude\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$gitignore = Join-Path $PSScriptRoot ".gitignore"
if (-not (Test-Path $gitignore) -or -not (Select-String -Path $gitignore -Pattern "^\.claude/logs/?$" -Quiet)) {
  Add-Content -Path $gitignore -Value "`n.claude/logs/"
}

function Finish([string]$msg) {
  Write-Host ""
  Write-Host $msg -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Recent commits:"
  git log --oneline -n 5
  [console]::Beep(880, 300)
  [console]::Beep(660, 300)
  exit
}

function Ensure-Emulator {
  if (-not $Avd) { return }
  $sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
  $adb = Join-Path $sdk "platform-tools\adb.exe"
  $emu = Join-Path $sdk "emulator\emulator.exe"
  if (-not (Test-Path $adb) -or -not (Test-Path $emu)) {
    Write-Warning "Couldn't find adb/emulator under $sdk. Skipping emulator start."
    return
  }
  if (& $adb devices | Select-String "\tdevice$") { return }
  Write-Host "Starting emulator $Avd ..."
  Start-Process -FilePath $emu -ArgumentList "-avd", $Avd -WindowStyle Minimized
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 5
    $boot = (& $adb shell getprop sys.boot_completed 2>$null) -join ""
    if ($boot.Trim() -eq "1") { Write-Host "Emulator ready."; return }
  }
  Write-Warning "Emulator didn't finish booting in 5 minutes. Continuing anyway."
}

$claudeArgs = @(
  "-p", "Read .claude/commands/auto-next.md and follow it exactly.",
  "--output-format", "json",
  "--max-turns", "$MaxTurns",
  "--permission-mode", "acceptEdits"
)
if ($Model) { $claudeArgs += @("--model", $Model) }

$noProgress = 0

for ($n = 1; $n -le $MaxTasks; $n++) {
  Ensure-Emulator
  $before = (git rev-parse HEAD 2>$null) -join ""
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  Write-Host ""
  Write-Host "=== Session $n of $MaxTasks ($stamp) ===" -ForegroundColor Cyan

  $raw = & claude @claudeArgs | Out-String
  $exitCode = $LASTEXITCODE
  $raw | Set-Content -Encoding UTF8 -Path (Join-Path $logDir "run-$stamp.json")

  $res = $null
  try { $res = $raw | ConvertFrom-Json } catch { }
  if ($res -is [array]) { $res = $res | Where-Object { $_.type -eq "result" } | Select-Object -Last 1 }
  if (-not $res) { Finish "Couldn't read Claude's output (exit code $exitCode). Raw output: $raw" }

  $text = [string]$res.result
  if ($text) { Write-Host $text }

  if ($res.permission_denials -and $res.permission_denials.Count -gt 0) {
    Write-Warning "Claude was blocked from these tools. If they're safe, add allow rules in .claude/settings.json:"
    $res.permission_denials | ForEach-Object { Write-Host "  - $($_.tool_name)" }
  }

  $status = ""
  $detail = ""
  if ($res.subtype -eq "error_max_turns") {
    Write-Host "Session hit $MaxTurns turns. Starting a fresh one to pick up where it stopped."
    $status = "CONTINUE"
  }
  elseif ($res.is_error -or $exitCode -ne 0) {
    Finish "Claude Code stopped with an error (often the usage limit). Last message: $text"
  }
  else {
    $m = [regex]::Matches($text, "STATUS:\s*(CONTINUE|NEEDS_INPUT|BLOCKED|DONE)([^\r\n]*)")
    if ($m.Count -eq 0) { Finish "No STATUS line in Claude's reply. Stopping to be safe." }
    $last = $m[$m.Count - 1]
    $status = $last.Groups[1].Value
    $detail = $last.Groups[2].Value.Trim(" -:".ToCharArray())
  }

  $after = (git rev-parse HEAD 2>$null) -join ""
  switch ($status) {
    "CONTINUE" {
      if ($after -eq $before) { $noProgress++ } else { $noProgress = 0 }
      if ($noProgress -ge 2) { Finish "Two sessions in a row made no new commit. Stopping so it doesn't burn usage." }
    }
    "NEEDS_INPUT" { Finish "Claude needs a decision. See 'Waiting on Luka' at the top of docs/PROGRESS.md." }
    "BLOCKED"     { Finish "Blocked: $detail" }
    "DONE"        { Finish "Every task in docs/PLAN.md is ticked." }
  }
}

Finish "Reached the limit of $MaxTasks sessions."