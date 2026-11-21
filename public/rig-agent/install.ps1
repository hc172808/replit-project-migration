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
$Mode = if ($env:SETUP_MODE) { $env:SETUP_MODE } else { "miner-only" }
if ($Mode -ne "miner-only") { throw "Use the server dashboard installer on Ubuntu/Debian or Fedora first, then Add rig. Windows setup is miner-only." }
if ($Dashboard -notmatch '^https://') { throw "Use the published https:// dashboard address." }
if ($env:RIG_TOKEN -notmatch '^rig_[a-fA-F0-9]{64}$') { throw "Use the token from Add rig." }
if ($RigName -match '[\r\n]') { throw "Rig name must be one line." }
$needNode = -not $node
if ($node) { $needNode = [int]((& node -p "process.versions.node.split('.')[0]")) -lt 22 }
if ($needNode) {
  Say "Installing Node.js LTS…"
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw "Install Microsoft App Installer (winget) or Node.js 22+ first." }
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) { throw "Node.js installation failed. Install Node.js 22+ and rerun." }
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  $node = Get-Command node
}
$NodeBin = $node.Source
if ([int]((& $NodeBin -p "process.versions.node.split('.')[0]")) -lt 22) { throw "Node.js 22+ is required." }

Say "Installing into $Dir"
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$Download = Join-Path $Dir "agent-download.mjs"
Invoke-WebRequest -UseBasicParsing "$Dashboard/rig-agent/agent.mjs" -OutFile $Download
& $NodeBin --check $Download
if ($LASTEXITCODE -ne 0) { Remove-Item $Download; throw "Downloaded rig program did not pass validation." }
Move-Item -Force $Download (Join-Path $Dir "agent.mjs")

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

Say "Task registered. Confirm the rig is online in your dashboard; select a profile and press Start to mine."
Say "GYDS is built in. Other coins require separately installed Windows miners and compatible GPU drivers or ASIC hardware."
Say "Logs: $Dir\rig.log"
