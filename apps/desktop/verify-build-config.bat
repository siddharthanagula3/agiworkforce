@echo off
REM Verification Script for Windows Build Configuration
REM Checks if all fixes for LNK1318 are properly configured

echo ========================================
echo Build Configuration Verification
echo ========================================
echo.

set ERROR_COUNT=0

REM Check 1: Rust version
echo [1/6] Checking Rust version...
rustc --version | findstr /C:"1.8" >nul 2>&1 || rustc --version | findstr /C:"1.9" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   WARNING: Rust version should be 1.80+ for best results
    set /a ERROR_COUNT+=1
) else (
    echo   OK: Rust version is recent
)
echo.

REM Check 2: Cargo config exists
echo [2/6] Checking .cargo/config.toml...
if exist "src-tauri\.cargo\config.toml" (
    echo   OK: .cargo/config.toml exists

    REM Check for debuginfo=0
    findstr /C:"debuginfo=0" "src-tauri\.cargo\config.toml" >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo   OK: debuginfo=0 flag found
    ) else (
        echo   ERROR: debuginfo=0 flag NOT found
        set /a ERROR_COUNT+=1
    )

    REM Check for strip=symbols
    findstr /C:"strip=symbols" "src-tauri\.cargo\config.toml" >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo   OK: strip=symbols flag found
    ) else (
        echo   WARNING: strip=symbols flag NOT found
        set /a ERROR_COUNT+=1
    )
) else (
    echo   ERROR: .cargo/config.toml not found
    set /a ERROR_COUNT+=1
)
echo.

REM Check 3: Workspace Cargo.toml
echo [3/6] Checking workspace Cargo.toml...
if exist "..\..\Cargo.toml" (
    findstr /C:"debug = 0" "..\..\Cargo.toml" >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo   OK: Workspace profile has debug = 0
    ) else (
        echo   ERROR: Workspace profile missing debug = 0
        set /a ERROR_COUNT+=1
    )
) else (
    echo   ERROR: Workspace Cargo.toml not found
    set /a ERROR_COUNT+=1
)
echo.

REM Check 4: Environment variables
echo [4/6] Checking environment variables...
if defined RUSTFLAGS (
    echo   INFO: RUSTFLAGS is set to: %RUSTFLAGS%
    echo %RUSTFLAGS% | findstr /C:"debuginfo=0" >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo   OK: RUSTFLAGS contains debuginfo=0
    ) else (
        echo   WARNING: RUSTFLAGS set but doesn't contain debuginfo=0
    )
) else (
    echo   INFO: RUSTFLAGS not set (will use .cargo/config.toml)
)
echo.

REM Check 5: Previous PDB files
echo [5/6] Checking for existing PDB files...
if exist "src-tauri\target\debug\*.pdb" (
    echo   WARNING: Old PDB files found in target\debug\
    echo   Recommend running: cargo clean
    set /a ERROR_COUNT+=1
) else (
    echo   OK: No PDB files found (or target not yet built)
)
echo.

REM Check 6: Build artifacts size
echo [6/6] Checking target directory size...
if exist "src-tauri\target\debug" (
    echo   INFO: Target directory exists
    dir "src-tauri\target\debug" | findstr /C:"bytes" >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo   Checking for excessive size...
    )
) else (
    echo   INFO: No debug target directory yet (not built)
)
echo.

REM Summary
echo ========================================
echo Verification Complete
echo ========================================
echo.

if %ERROR_COUNT% EQU 0 (
    echo STATUS: All checks passed! Ready to build.
    echo.
    echo Next steps:
    echo   1. Run: cargo clean
    echo   2. Run: build-windows.bat
    echo.
    exit /b 0
) else (
    echo STATUS: %ERROR_COUNT% issues found
    echo.
    echo Please review the errors above and ensure:
    echo   - .cargo/config.toml has rustflags with debuginfo=0
    echo   - Workspace Cargo.toml has [profile.dev] debug = 0
    echo   - Run cargo clean before building
    echo.
    exit /b 1
)
