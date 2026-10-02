@echo off
rem Starts the stat designer and opens it in your browser.
rem Close this window to stop it.
setlocal
set PORT=8734

where node >nul 2>nul
if %errorlevel%==0 (
  start "" cmd /c "timeout /t 2 >nul & start http://localhost:%PORT%/tools/stat-designer/"
  node "%~dp0serve.mjs" %PORT%
  goto :end
)

rem No Node: plain Python server. Works, but hero pictures will be blank in exports.
echo.
echo   Node.js not found - using Python instead.
echo   Hero pictures will show on screen but NOT in downloaded/copied images.
echo   Install Node.js (nodejs.org) to fix that.
echo.
cd /d "%~dp0..\.."
set PY=python
where python >nul 2>nul || set PY=py
start "" cmd /c "timeout /t 2 >nul & start http://localhost:%PORT%/tools/stat-designer/"
%PY% -m http.server %PORT%

:end
pause
