@echo off
rem Starts the highlight cutter and opens it in your browser.
rem Close this window to stop it.
rem Videos, renders and project files go in D:\Videos\SecretShop unless you
rem pass another folder:  launch.bat "E:\Somewhere"
setlocal
set PORT=8735
if not "%~1"=="" set HC_DATA=%~1

where node >nul 2>nul || (echo Node.js is needed: https://nodejs.org & pause & exit /b 1)
where ffmpeg >nul 2>nul || (echo ffmpeg is needed:  winget install Gyan.FFmpeg & pause & exit /b 1)
where yt-dlp >nul 2>nul || echo   Note: yt-dlp not found, so Twitch downloads won't work.  winget install yt-dlp.yt-dlp

start "" cmd /c "timeout /t 2 >nul & start http://localhost:%PORT%/tools/highlight-cutter/"
node "%~dp0serve.mjs" %PORT%
pause
