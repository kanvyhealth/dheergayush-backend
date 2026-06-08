# Sync Firebase credentials to Render (requires RENDER_API_KEY).
# Usage:
#   $env:RENDER_API_KEY = "rnd_..."
#   .\scripts\sync-render-firebase-env.ps1
# Optional: $env:RENDER_SERVICE_ID = "srv-..." (auto-discovered if omitted)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if (-not $env:RENDER_API_KEY) {
  Write-Host "RENDER_API_KEY is not set."
  Write-Host "Get one from: https://dashboard.render.com/u/settings#api-keys"
  Write-Host "Then run: `$env:RENDER_API_KEY = 'rnd_...'; .\scripts\sync-render-firebase-env.ps1"
  exit 1
}

$credPath = ".\firebase-service-account.json"
if (-not (Test-Path $credPath)) {
  Write-Error "Missing $credPath"
}

$minified = node scripts/minify-firebase-credentials.cjs $credPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Save local copy for manual paste (gitignored)
@(
  "# Paste FIREBASE_SERVICE_ACCOUNT_JSON in Render -> Environment"
  "FIREBASE_SERVICE_ACCOUNT_JSON=$minified"
) | Set-Content -Path ".render-env.local" -Encoding UTF8
Write-Host "Wrote .render-env.local (gitignored)"

$headers = @{
  Authorization = "Bearer $($env:RENDER_API_KEY)"
  Accept        = "application/json"
}

$serviceId = $env:RENDER_SERVICE_ID
if (-not $serviceId) {
  Write-Host "Looking up Render service..."
  $services = Invoke-RestMethod -Uri "https://api.render.com/v1/services?limit=50" -Headers $headers
  $match = $services | ForEach-Object { $_.service } | Where-Object {
    $_.name -match 'dheergayush' -or $_.repo -match 'dheergayush-backend'
  } | Select-Object -First 1
  if (-not $match) {
    Write-Error "Could not find dheergayush service. Set RENDER_SERVICE_ID=srv-..."
  }
  $serviceId = $match.id
  Write-Host "Using service: $($match.name) ($serviceId)"
}

Write-Host "Fetching current env vars..."
$envVars = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$serviceId/env-vars?limit=100" -Headers $headers
$existing = @{}
foreach ($item in $envVars) {
  if ($item.envVar) {
    $existing[$item.envVar.key] = $item.envVar
  }
}

function Set-RenderEnvVar {
  param([string]$Key, [string]$Value)
  if ($existing.ContainsKey($Key)) {
    $id = $existing[$Key].id
    Write-Host "Updating $Key ..."
    Invoke-RestMethod -Method Put -Uri "https://api.render.com/v1/services/$serviceId/env-vars/$id" `
      -Headers $headers -ContentType "application/json" `
      -Body (@{ value = $Value } | ConvertTo-Json) | Out-Null
  } else {
    Write-Host "Creating $Key ..."
    Invoke-RestMethod -Method Post -Uri "https://api.render.com/v1/services/$serviceId/env-vars" `
      -Headers $headers -ContentType "application/json" `
      -Body (@{ key = $Key; value = $Value } | ConvertTo-Json) | Out-Null
  }
}

function Remove-RenderEnvVar {
  param([string]$Key)
  if ($existing.ContainsKey($Key)) {
    $id = $existing[$Key].id
    Write-Host "Deleting $Key ..."
    Invoke-RestMethod -Method Delete -Uri "https://api.render.com/v1/services/$serviceId/env-vars/$id" `
      -Headers $headers | Out-Null
  }
}

Set-RenderEnvVar -Key "FIREBASE_SERVICE_ACCOUNT_JSON" -Value $minified
Remove-RenderEnvVar -Key "GOOGLE_APPLICATION_CREDENTIALS"

# Ensure core vars from .env if present
if (Test-Path ".env") {
  Get-Content ".env" | ForEach-Object {
    if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$' -and $matches[1] -notmatch '^(GOOGLE_APPLICATION_CREDENTIALS|FIREBASE_SERVICE_ACCOUNT_JSON|PORT)$') {
      $k = $matches[1]
      $v = $matches[2].Trim()
      if ($v -and $k -match '^(FIREBASE_|SITE_URL|RAZORPAY_|AGORA_|ADMIN_)') {
        if ($k -eq 'SITE_URL' -and $v -match 'localhost') {
          $v = 'https://dheergayush.net'
        }
        Set-RenderEnvVar -Key $k -Value $v
      }
    }
  }
}

Write-Host "Triggering deploy..."
Invoke-RestMethod -Method Post -Uri "https://api.render.com/v1/services/$serviceId/deploys" `
  -Headers $headers -ContentType "application/json" `
  -Body '{}' | Out-Null

Write-Host "Done. Check https://dashboard.render.com and https://dheergayush.net/api/health"
