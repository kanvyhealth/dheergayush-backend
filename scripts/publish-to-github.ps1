# Run from project root after: gh auth login
# Creates repo (if needed) and pushes main branch

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

$repo = "kanvyhealth/dheergayush-backend"
Write-Host "Publishing to https://github.com/$repo"

gh auth status
if ($LASTEXITCODE -ne 0) {
    Write-Host "Run: gh auth login"
    exit 1
}

gh repo view $repo 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating public repository $repo ..."
    gh repo create $repo --public --description "DHEERGAYUSH telemedicine Node.js backend"
}

git remote remove origin 2>$null
git remote add origin "https://github.com/$repo.git"
git branch -M main
git push -u origin main --force

Write-Host "Done. Connect this repo in Render Dashboard -> Settings -> Build and Deploy."
