@echo off
title PDF Studio Pro Launcher
cd /d "%~dp0"

echo ========================================================
echo               Starting PDF Studio Pro...
echo ========================================================
echo.

where python >nul 2>nul
if %errorlevel% equ 0 (
    echo Launching with Python...
    python server.py
    goto end
)

where node >nul 2>nul
if %errorlevel% equ 0 (
    echo Launching with Node.js...
    node server.js
    goto end
)

echo Opening directly in your default web browser...
start index.html

:end
pause
