@echo off
setlocal
cd /d "%~dp0"
start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0scripts\Start-TrackerServices.ps1"
exit /b 0
