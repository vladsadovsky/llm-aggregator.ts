param(
  [Parameter(Mandatory = $true)]
  [string]$CurrentMsi,
  [string]$PreviousMsi
)

$ErrorActionPreference = 'Stop'
$expectedExe = Join-Path $env:LOCALAPPDATA 'Programs\LLM Aggregator\LLM Aggregator.exe'
$logDir = Join-Path $env:TEMP 'llm-aggregator-msi-validation'
New-Item -ItemType Directory -Force $logDir | Out-Null

function Invoke-MsiExec {
  param([string[]]$Arguments, [string]$Operation)

  $process = Start-Process msiexec.exe -ArgumentList $Arguments -Wait -PassThru
  if ($process.ExitCode -notin @(0, 3010)) {
    throw "$Operation failed with msiexec exit code $($process.ExitCode)."
  }
}

function Install-Msi {
  param([string]$Path, [string]$LogName)

  $resolved = (Resolve-Path $Path).Path
  Invoke-MsiExec @('/i', "`"$resolved`"", '/qn', '/norestart', '/l*v', "`"$(Join-Path $logDir $LogName)`"") "Install $resolved"
  if (-not (Test-Path $expectedExe)) {
    throw "Install completed but the expected executable was not found at $expectedExe."
  }
}

if ($PreviousMsi) {
  Install-Msi $PreviousMsi 'install-previous.log'
  Install-Msi $CurrentMsi 'upgrade-current.log'
} else {
  Install-Msi $CurrentMsi 'install-current.log'
}

$current = (Resolve-Path $CurrentMsi).Path
Invoke-MsiExec @('/x', "`"$current`"", '/qn', '/norestart', '/l*v', "`"$(Join-Path $logDir 'uninstall.log')`"") 'Uninstall current MSI'
if (Test-Path $expectedExe) {
  throw "Uninstall completed but the executable remains at $expectedExe."
}

Write-Output "MSI lifecycle validation passed. Logs: $logDir"
