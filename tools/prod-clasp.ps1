<#
  Production clasp (docs/LAUNCH.md section 1.2). Runs:  clasp --user prod -P .clasp.prod.json <command>
  Refuses unless
    - .clasp.prod.json exists and its scriptId is not the staging project, and
    - the "prod" clasp login is an @elitetravelng.com account (clasp login --user prod, done by the operator).
  Plain `clasp ...` (default login + .clasp.json) stays on STAGING.

  Usage (project root):  powershell -ExecutionPolicy Bypass -File tools/prod-clasp.ps1 push
                         powershell -ExecutionPolicy Bypass -File tools/prod-clasp.ps1 update-deployment <prod id> -d "production vN"
#>
$ErrorActionPreference = 'Stop'
$ClaspArgs = $args
$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root '.clasp.prod.json'
$stagingScript = '1H510Iw90QAggF4gjWJomnZ7KoU9pD4O3Lopkafjgg0KTCPwYS8hda4kO'
$stagingDeploy = 'AKfycbzSBOiav81YF7eKJvqLaXJM1p2S6oRXeKVVhsGKgCtMfkdKZUrXr7cC0UQ-bRZ6kjtqXQ'

if (-not (Test-Path $project)) { Write-Error 'Refused: .clasp.prod.json is missing (docs/LAUNCH.md section 1.2).'; exit 2 }
$cfg = Get-Content $project -Raw | ConvertFrom-Json
if (-not $cfg.scriptId -or $cfg.scriptId -eq $stagingScript -or $cfg.scriptId -match 'PASTE') { Write-Error 'Refused: .clasp.prod.json scriptId is empty or the STAGING project.'; exit 2 }
if ($cfg.rootDir -ne 'apps-script') { Write-Error 'Refused: .clasp.prod.json rootDir must be apps-script.'; exit 2 }
if (($ClaspArgs -join ' ') -match [regex]::Escape($stagingDeploy)) { Write-Error 'Refused: that is the STAGING deployment.'; exit 2 }

$who = (& clasp --user prod show-authorized-user | Out-String)
if ($who -notmatch '@elitetravelng\.com') { Write-Error 'Refused: the "prod" clasp login is not an @elitetravelng.com account. Operator: clasp login --user prod'; exit 2 }

Write-Host ('production clasp -> ' + ($ClaspArgs -join ' '))
& clasp --user prod -P $project @ClaspArgs
exit $LASTEXITCODE
