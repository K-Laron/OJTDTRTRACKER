@echo off
echo Starting OJT DTR Tracker...

:: Start the Express backend in the background
cd server
start /B node server.js

:: Go back to the main directory and start the Vite frontend in the background
cd ..
start /B npm run dev

:: Open the app in the default browser
timeout /t 3 /nobreak >nul
start http://localhost:5173

:: Auto-close this terminal window after 5 seconds
echo App started successfully! Closing this window...
timeout /t 5 /nobreak >nul
exit
