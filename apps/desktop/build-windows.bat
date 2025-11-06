@echo off
REM Windows Build Script for AGI Workforce Desktop
REM Prevents LNK1318 PDB limit error by forcing zero debug info

echo ========================================
echo AGI Workforce Desktop - Windows Build
echo ========================================
echo.
echo This script prevents LNK1318 PDB errors by:
echo   1. Setting RUSTFLAGS to force debuginfo=0
echo   2. Disabling incremental compilation
echo   3. Cleaning previous build artifacts
echo.

REM Set critical environment variables to prevent PDB generation
set RUSTFLAGS=-C debuginfo=0 -C strip=symbols -C incremental=false
set CARGO_INCREMENTAL=0
set CARGO_PROFILE_DEV_DEBUG=0
set CARGO_PROFILE_DEV_SPLIT_DEBUGINFO=off

REM Clean previous build to ensure fresh start
echo [1/3] Cleaning previous build artifacts...
cargo clean
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to clean build artifacts
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Building Tauri application (dev mode)...
echo This will take several minutes with 1,040 crates...
echo.

cd apps\desktop
pnpm tauri dev

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================
    echo BUILD FAILED
    echo ========================================
    echo.
    echo If you see LNK1318 errors, this indicates:
    echo   - A dependency is forcing debug info generation
    echo   - Try: cargo clean and rebuild
    echo   - Check for rogue build.rs scripts
    echo.
    exit /b %ERRORLEVEL%
)

echo.
echo ========================================
echo BUILD SUCCESSFUL
echo ========================================
