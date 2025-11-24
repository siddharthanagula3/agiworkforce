# Reset AGI Workforce App State
# Run this PowerShell script to completely reset the app

Write-Host "🧹 Resetting AGI Workforce App State..." -ForegroundColor Cyan

# 1. Kill all processes
Write-Host "`n1️⃣ Killing processes..." -ForegroundColor Yellow
Get-Process -Name "agiworkforce-desktop" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*agiworkforce*" } | Stop-Process -Force
Start-Sleep -Seconds 2

# 2. Clear AppData
Write-Host "`n2️⃣ Clearing AppData..." -ForegroundColor Yellow
$appData = "$env:APPDATA\agiworkforce"
$localAppData = "$env:LOCALAPPDATA\agiworkforce"

if (Test-Path $appData) {
    Remove-Item -Path "$appData\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Cleared $appData" -ForegroundColor Green
}

if (Test-Path $localAppData) {
    Remove-Item -Path "$localAppData\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Cleared $localAppData" -ForegroundColor Green
}

# 3. Clear browser data (if in browser mode)
Write-Host "`n3️⃣ Instructions for clearing browser data:" -ForegroundColor Yellow
Write-Host "   - Press F12 (DevTools)" -ForegroundColor White
Write-Host "   - Go to Application tab" -ForegroundColor White
Write-Host "   - Click 'Clear site data'" -ForegroundColor White
Write-Host "   - OR run: localStorage.clear(); sessionStorage.clear();" -ForegroundColor Cyan

# 4. Restart
Write-Host "`n4️⃣ Ready to restart!" -ForegroundColor Green
Write-Host "`nRun: cd C:\Users\SIDDHARTHA NAGULA\agiworkforce && pnpm dev:desktop`n" -ForegroundColor Cyan

Write-Host "✨ Reset complete!`n" -ForegroundColor Green
