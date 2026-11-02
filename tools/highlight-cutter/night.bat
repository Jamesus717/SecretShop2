@echo off
rem The night run, for Task Scheduler (see night-task.xml). Writes a log to <data folder>\night\last-run.log.
rem Usage: night.bat ["D:\Videos\SecretShop"] [extra night.mjs flags, e.g. --delete-vods]
setlocal
if not "%~1"=="" set HC_DATA=%~1
if "%HC_DATA%"=="" set HC_DATA=D:\Videos\SecretShop
if not exist "%HC_DATA%\night" mkdir "%HC_DATA%\night"
shift
node "%~dp0night.mjs" %1 %2 %3 %4 >> "%HC_DATA%\night\last-run.log" 2>&1
exit /b %errorlevel%
