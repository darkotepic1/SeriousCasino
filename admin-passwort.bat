@echo off
rem Admin-Passwort fuer den Admin-Bereich festlegen oder aendern
cd /d "%~dp0"
if exist "%~dp0node\node.exe" set "PATH=%~dp0node;%PATH%"
node server\admin-password.js
echo.
pause
