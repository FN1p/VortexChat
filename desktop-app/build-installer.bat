@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

title VortexChat by PFT Studio — Windows Installer (.exe) Builder
color 0B

echo ==============================================================================
echo      VORTEXCHAT BY PFT STUDIO — AUTOMATED WINDOWS INSTALLER (.EXE) BUILDER
echo ==============================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js is not found in your system PATH!
    echo Please download and install Node.js 18+ or 20+ LTS from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [STEP 1/2] Installing VortexChat dependencies via npm...
call npm ci --no-audit --no-fund
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)

echo.
echo [STEP 2/2] Building versioned Setup and Portable EXE files...
call npm run dist
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] electron-builder encountered an error while packaging.
    pause
    exit /b 1
)

color 0A
echo.
echo ==============================================================================
echo                VORTEXCHAT BUILD FINISHED SUCCESSFULLY!
echo ==============================================================================
echo   Output files in dist/:
echo     - VortexChat-Setup-*.exe    (NSIS Windows Installer)
echo     - VortexChat-Portable-*.exe (Standalone Portable)
echo ==============================================================================

if exist "%~dp0dist" (
    explorer "%~dp0dist"
)

pause
