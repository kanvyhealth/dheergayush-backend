@echo off
setlocal EnableExtensions
title DHEERGAYUSH - Local Server

cd /d "%~dp0"

echo.
echo  ============================================
echo    DHEERGAYUSH - Starting Local Server
echo  ============================================
echo.

where node >nul 2>&1
if errorlevel 1 goto :no_node

echo  Node:
node -v
echo  npm:
call npm -v
echo.

if not exist "node_modules" goto :install_deps
goto :deps_ok

:install_deps
echo  Installing npm packages - first run may take a minute...
echo.
call npm install
if errorlevel 1 goto :install_failed
echo.

:deps_ok
if exist ".env" goto :env_ok
echo  Creating .env with local defaults...
> ".env" echo PORT=3000
>> ".env" echo FIREBASE_PROJECT_ID=your-firebase-project-id
>> ".env" echo GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json
>> ".env" echo NGROK_AUTHTOKEN=
echo  Created .env - add your Firebase project ID and service account JSON.
echo  See FIREBASE_MIGRATION.md for setup steps.
echo.

:env_ok
if not exist "uploads" mkdir "uploads"

set "PORT=3000"
set "LANDING=http://localhost:%PORT%/landingpage.html"
echo  Site URL:  http://localhost:%PORT%/
echo  Landing:   %LANDING%
echo  CMEs:      http://localhost:%PORT%/CMEs.html
echo.
echo  Database: Firebase Firestore (same project as the mobile app)
echo  Set FIREBASE_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS in .env
echo.
echo  Browser opens once the server is ready.
echo  Press Ctrl+C in this window to stop the server.
echo  ============================================
echo.

netstat -ano | findstr ":%PORT%" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 goto :port_in_use

goto :start_server

:port_in_use
echo  [INFO] Port %PORT% is in use - stopping old server to load latest code...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%P >nul 2>&1
)
timeout /t 2 /nobreak >nul 2>&1

:start_server
start "" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\wait-and-open-landing.ps1" -Port %PORT%

node server.js
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if %EXIT_CODE% NEQ 0 echo  Server exited with error code %EXIT_CODE%.
if %EXIT_CODE% EQU 0 echo  Server stopped.
pause
exit /b %EXIT_CODE%

:no_node
echo  [ERROR] Node.js is not installed.
echo  Install from: https://nodejs.org/
echo.
pause
exit /b 1

:install_failed
echo.
echo  [ERROR] npm install failed.
pause
exit /b 1
