# Builds the site and deploys it to AWS Amplify as a manual (zip) deployment. No Git involved.
# Usage: npm run deploy   (needs the AWS CLI signed in with Amplify permissions, and .env.local with the production values)
param(
  [string]$AppId = 'd2g9yn1a89sqiw',
  [string]$Branch = 'webapp-fronted',
  [string]$Region = 'ap-south-1'
)
$ErrorActionPreference = 'Stop'
$aws = (Get-Command aws -ErrorAction SilentlyContinue).Source
if (-not $aws) { $aws = 'C:\Program Files\Amazon\AWSCLIV2\aws.exe' }
$root = Split-Path $PSScriptRoot -Parent
$zip = Join-Path $env:TEMP "env-webapp-$(Get-Date -Format yyyyMMddHHmmss).zip"

Push-Location $root
try {
  # Vite bakes VITE_ values in at build time, so the backend URL must be set before building.
  $envText = (Get-ChildItem .env.local, .env.production.local -ErrorAction SilentlyContinue | Get-Content) -join "`n"
  if ($envText -notmatch '(?m)^VITE_API_URL=https://') { throw 'Set VITE_API_URL=https://... (the deployed backend) in .env.local before deploying.' }

  npm run build
  if ($LASTEXITCODE) { throw 'Build failed.' }

  # Zip the contents of dist/ with forward-slash paths (Amplify rejects backslash entries).
  Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
  $dist = (Resolve-Path dist).Path
  $archive = [IO.Compression.ZipFile]::Open($zip, 'Create')
  try {
    Get-ChildItem $dist -Recurse -File | ForEach-Object {
      $name = $_.FullName.Substring($dist.Length + 1).Replace('\', '/')
      [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $name)
    }
  } finally { $archive.Dispose() }

  $deployment = & $aws amplify create-deployment --region $Region --app-id $AppId --branch-name $Branch --output json | ConvertFrom-Json
  if ($LASTEXITCODE) { throw 'Could not create the Amplify deployment. Is the AWS CLI signed in?' }
  Write-Host "Uploading build (job $($deployment.jobId))..."
  Invoke-WebRequest -Uri $deployment.zipUploadUrl -Method Put -InFile $zip -ContentType 'application/zip' -UseBasicParsing | Out-Null
  & $aws amplify start-deployment --region $Region --app-id $AppId --branch-name $Branch --job-id $deployment.jobId --output json | Out-Null

  do {
    Start-Sleep -Seconds 5
    $status = & $aws amplify get-job --region $Region --app-id $AppId --branch-name $Branch --job-id $deployment.jobId --query 'job.summary.status' --output text
    Write-Host "Deployment $($deployment.jobId): $status"
  } while ($status -in 'PENDING', 'PROVISIONING', 'RUNNING', 'DEPLOYING')
  if ($status -ne 'SUCCEED') { throw "Deployment ended with status $status." }
  Write-Host "Live: https://$Branch.$AppId.amplifyapp.com"
} finally {
  Pop-Location
  Remove-Item $zip -ErrorAction SilentlyContinue
}
