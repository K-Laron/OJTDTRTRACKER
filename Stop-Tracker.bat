@echo off
echo Shutting down OJT DTR Tracker servers...

:: Find and kill the Node.js processes running the backend and frontend
taskkill /F /IM node.js >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1

echo Servers have been successfully stopped! Closing this window...
timeout /t 5 /nobreak >nul
exit
