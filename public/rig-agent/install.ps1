# GYDS rig program installer — Windows 10/11 (PowerShell).
# Copy the exact line from your dashboard's "Add rig" screen, e.g.:
#   $env:DASHBOARD_URL="https://YOUR-DASHBOARD"; $env:RIG_TOKEN="rig_..."; $env:RIG_NAME="gaming-pc"; iwr -useb https://YOUR-DASHBOARD/rig-agent/install.ps1 | iex
#
# Installs into %USERPROFILE%\.gyds-rig and registers a task that starts at
# logon and restarts the program if it stops, so it mines until you press Stop.
$ErrorActionPreference = "Stop"

if (-not $env:DASHBOARD_URL -or -not $env:RIG_TOKEN) { throw "Set DASHBOARD_URL and RIG_TOKEN first." }
$Dashboard = $env:DASHBOARD_URL.TrimEnd("/")
$RigName = if ($env:RIG_NAME) { $env:RIG_NAME } else { $env:COMPUTERNAME }
$Dir = if ($env:INSTALL_DIR) { $env:INSTALL_DIR } else { Join-Path $env:USERPROFILE ".gyds-rig" }

function Say($m) { Write-Host "==> $m" -ForegroundColor Cyan }

$node = Get-Command node -ErrorAction SilentlyContinue
$needNode = -not $node
if ($node) { $needNode = [int]((& node -p "process.versions.node.split('.')[0]")) -lt 18 }
if ($needNode) {
  Say "Installing Node.js LTS…"
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  $node = Get-Command node
}
$NodeBin = $node.Source

Say "Installing into $Dir"
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Invoke-WebRequest -UseBasicParsing "$Dashboard/rig-agent/agent.mjs" -OutFile (Join-Path $Dir "agent.mjs")

$envFile = Join-Path $Dir ".env"
if (Test-Path $envFile) {
  (Get-Content $envFile) `
    -replace '^DASHBOARD_URL=.*', "DASHBOARD_URL=$Dashboard" `
    -replace '^RIG_TOKEN=.*', "RIG_TOKEN=$($env:RIG_TOKEN)" `
    -replace '^RIG_NAME=.*', "RIG_NAME=$RigName" | Set-Content $envFile
} else {
@"
# GYDS rig program settings - keep this file private
DASHBOARD_URL=$Dashboard
RIG_TOKEN=$($env:RIG_TOKEN)
RIG_NAME=$RigName

# Paths to mining programs you've installed (only the ones you use)
XMRIG_PATH=C:\miners\xmrig\xmrig.exe
TREX_PATH=C:\miners\t-rex\t-rex.exe
LOLMINER_PATH=C:\miners\lolminer\lolMiner.exe
SRBMINER_PATH=C:\miners\srbminer\SRBMiner-MULTI.exe
CGMINER_PATH=C:\miners\cgminer\cgminer.exe

# Let the dashboard change GPU clocks, power and fans on this machine
ALLOW_GPU_OC=false
# Install new rig program versions automatically (otherwise press Update on the dashboard)
AUTO_UPDATE=false
"@ | Set-Content $envFile
}

# Restart-forever wrapper
$runner = Join-Path $Dir "run.ps1"
@"
Set-Location "$Dir"
while (`$true) {
  & "$NodeBin" agent.mjs *>> "$Dir\rig.log"
  Start-Sleep -Seconds 3
}
"@ | Set-Content $runner

$taskName = "GYDS Rig"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Keeps the GYDS rig program running" | Out-Null
Start-ScheduledTask -TaskName $taskName

Say "Done. The rig starts at logon and restarts itself. It should appear on the dashboard within ~15 seconds."
Say "Logs: $Dir\rig.log"
