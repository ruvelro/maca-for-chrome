@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0build-chrome.ps1"
exit /b %errorlevel%
