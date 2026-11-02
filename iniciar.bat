@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Hace falta Node.js para iniciar la app: https://nodejs.org
  pause
  exit /b 1
)
node tools\servir.js %*
pause
