@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0build-firefox.ps1"
exit /b %errorlevel%
