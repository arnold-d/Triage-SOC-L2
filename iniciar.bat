@echo off
rem Abre la app. Node.js solo hace falta para usar Ollama (IA local); sin Node, se abre el archivo directamente.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto sinnode
node tools\servir.js %*
pause
exit /b
:sinnode
echo No se encontro Node.js: se abre la app directamente en el navegador.
echo La app funciona entera sin Node. Node solo hace falta para usar Ollama: https://nodejs.org
start "" "%~dp0app\index.html"
pause
