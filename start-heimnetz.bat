@echo off
rem Spass-Casino im HEIMNETZ starten: Freunde im selben WLAN koennen mitspielen.
rem Hinweis: Beim ersten Start fragt Windows nach einer Firewall-Freigabe -> bei 'Private Netzwerke' zulassen.
cd /d "%~dp0"
title Spass-Casino (Heimnetz)
color 0A

rem Mitgelieferte Node-Version bevorzugen, sonst eine installierte verwenden
if exist "%~dp0node\node.exe" (
  set "PATH=%~dp0node;%PATH%"
)
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js wurde nicht gefunden.
  echo  Bitte Node.js LTS von https://nodejs.org installieren und start.bat erneut starten.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\web-push" (
  echo  Erster Start: Installiere benoetigte Bausteine ^(einmalig, braucht Internet^) ...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo  Installation fehlgeschlagen.
    pause
    exit /b 1
  )
)

echo.
echo  HEIMNETZ-MODUS: Freunde im selben WLAN koennen mitspielen.
echo  Falls Windows nach der Firewall fragt: 'Private Netzwerke' erlauben.
echo.
node server\index.js --open --lan
echo.
echo  Der Server wurde beendet.
pause
