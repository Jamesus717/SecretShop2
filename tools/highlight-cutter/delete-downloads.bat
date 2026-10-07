@echo off
rem Deletes every downloaded VOD and replay recording (the big files).
rem Keeps rendered videos, cards and series setups.
setlocal
set DATA=D:\Videos\SecretShop
if not "%HC_DATA%"=="" set DATA=%HC_DATA%
set MEDIA=%DATA%\media

if not exist "%MEDIA%" (echo Nothing to delete - %MEDIA% doesn't exist. & pause & exit /b 0)
echo These files will be deleted:
echo.
dir /b /s "%MEDIA%\*.mp4" "%MEDIA%\*.mkv" "%MEDIA%\*.dem" "%MEDIA%\*.part" 2>nul
echo.
set /p OK=Delete them? Type y and press Enter:
if /i not "%OK%"=="y" (echo Cancelled. & pause & exit /b 0)
del /q /s "%MEDIA%\*.mp4" "%MEDIA%\*.mkv" "%MEDIA%\*.dem" "%MEDIA%\*.part" "%MEDIA%\*.ytdl" 2>nul
echo Done. Rendered videos in %DATA%\output were kept.
pause
