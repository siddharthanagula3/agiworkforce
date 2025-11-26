# ===============================================================================
# DEV-ONLY SCRIPT - NOT FOR DISTRIBUTION
# ===============================================================================
# Reset AGI Workforce App State (Development Environment Only)
# This script is for developers to reset their local development environment
# It should NOT be included in production builds or distributed to users
# ===============================================================================

Write-Host "🧹 Resetting AGI Workforce App State..." -ForegroundColor Cyan
Write-Host "⚠️  DEV-ONLY SCRIPT - This will delete all local app data!" -ForegroundColor Yellow
Write-Host ""

# Confirm with user
$confirmation = Read-Host "Are you sure you want to reset? (yes/no)"
if ($confirmation -ne "yes") {
    Write-Host "❌ Reset cancelled." -ForegroundColor Red
    exit 0
}

# 1. Kill all processes
Write-Host "`n1️⃣ Killing processes..." -ForegroundColor Yellow
Get-Process -Name "agiworkforce-desktop" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*agiworkforce*" } | Stop-Process -Force
Start-Sleep -Seconds 2
Write-Host "   ✅ Processes terminated" -ForegroundColor Green

# 2. Clear AppData
Write-Host "`n2️⃣ Clearing AppData..." -ForegroundColor Yellow
$appData = "$env:APPDATA\agiworkforce"
$localAppData = "$env:LOCALAPPDATA\agiworkforce"

if (Test-Path $appData) {
    Remove-Item -Path "$appData\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Cleared $appData" -ForegroundColor Green
} else {
    Write-Host "   ℹ️  No data found at $appData" -ForegroundColor Gray
}

if (Test-Path $localAppData) {
    Remove-Item -Path "$localAppData\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Cleared $localAppData" -ForegroundColor Green
} else {
    Write-Host "   ℹ️  No data found at $localAppData" -ForegroundColor Gray
}

# 3. Clear browser data (instructions)
Write-Host "`n3️⃣ Browser data (if using web version):" -ForegroundColor Yellow
Write-Host "   Open DevTools (F12) → Application tab → Clear site data" -ForegroundColor White
Write-Host "   Or run in console: localStorage.clear(); sessionStorage.clear();" -ForegroundColor Cyan

# 4. Ready to restart
Write-Host "`n4️⃣ Ready to restart!" -ForegroundColor Green
Write-Host ""
Write-Host "To start dev server, run:" -ForegroundColor Cyan
Write-Host "   pnpm dev:desktop" -ForegroundColor White
Write-Host ""
Write-Host "✨ Reset complete!" -ForegroundColor Green
Write-Host ""
