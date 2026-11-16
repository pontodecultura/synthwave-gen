@echo off
setlocal
cd /d "%~dp0"
title NEON DRIVE - Synthwave Studio
where py >nul 2>nul
if %errorlevel%==0 (
  start "NEON DRIVE SERVER" /min cmd /c "py -3 -m http.server 8765 --bind 127.0.0.1"
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    start "NEON DRIVE SERVER" /min cmd /c "python -m http.server 8765 --bind 127.0.0.1"
  ) else (
    echo Python 3 nao foi encontrado. Abra index.html diretamente no Chrome ou Edge.
    pause
    exit /b 1
  )
)
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:8765
echo NEON DRIVE esta sendo servido em http://127.0.0.1:8765
endlocal
