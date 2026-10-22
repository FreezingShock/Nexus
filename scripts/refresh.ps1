<#
  Pulls the latest `integration` branch and restarts the static server on http://localhost:8000.
  Run from anywhere:   powershell -ExecutionPolicy Bypass -File scripts\refresh.ps1
  Other branch:        scripts\refresh.ps1 -Branch main
  Other port:          scripts\refresh.ps1 -Port 8001
  Pull only:           scripts\refresh.ps1 -NoServer
#>
param(
  [string]$Branch = 'integration',
  [int]$Port = 8000,
  [switch]$NoServer
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

if (git status --porcelain) {
  Write-Host 'You have uncommitted changes in this folder. Commit or stash them first, then run this again.' -ForegroundColor Yellow
  exit 1
}

git fetch origin $Branch
if ($LASTEXITCODE -ne 0) { Write-Host "Could not fetch '$Branch'. Does the branch exist on GitHub yet?" -ForegroundColor Yellow; exit 1 }
git checkout $Branch
if ($LASTEXITCODE -ne 0) { exit 1 }
git pull --ff-only origin $Branch
if ($LASTEXITCODE -ne 0) { Write-Host "Local '$Branch' has diverged from GitHub. Run: git reset --hard origin/$Branch  (only if you have no local work to keep)" -ForegroundColor Yellow; exit 1 }
Write-Host ('Now on {0} at {1}' -f $Branch, (git log -1 --format='%h %s'))

if ($NoServer) { exit 0 }

# stop whatever is already listening on the port (normally the previous run of this script)
$old = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($c in $old) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }

$py = Get-Command python -ErrorAction SilentlyContinue
if ($py) { $exe = 'python'; $pre = @() }
elseif (Get-Command py -ErrorAction SilentlyContinue) { $exe = 'py'; $pre = @('-3') }
else { Write-Host 'Python 3 was not found. Install it, or serve this folder with any static server.' -ForegroundColor Yellow; exit 1 }

Start-Process -FilePath $exe -ArgumentList ($pre + @('scripts/serve.py', $Port)) -WorkingDirectory $repo -WindowStyle Minimized
Start-Sleep -Milliseconds 700
Write-Host "Serving $Branch at http://localhost:$Port/  (hard refresh with Ctrl+F5 if the page looks old)" -ForegroundColor Green
Start-Process "http://localhost:$Port/"
