@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0sign-firefox.ps1"
exit /b %errorlevel%
