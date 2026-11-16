@echo off
setlocal
cd /d "%~dp0"
title NEON DRIVE - Synthwave Studio Audio Fix
set PORT=8767
set HOST=127.0.0.1
where py >nul 2>nul
if %errorlevel%==0 (
  start "NEON DRIVE SERVER" /min cmd /c "py -3 -m http.server %PORT% --bind %HOST%"
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    start "NEON DRIVE SERVER" /min cmd /c "python -m http.server %PORT% --bind %HOST%"
  ) else (
    echo Python 3 nao foi encontrado. Abra index.html diretamente no Chrome ou Edge.
    pause
    exit /b 1
  )
)
timeout /t 2 /nobreak >nul
start "" http://%HOST%:%PORT%/
echo NEON DRIVE Audio Fix esta sendo servido em http://%HOST%:%PORT%/
echo Para evitar conflitos, esta versao utiliza a porta %PORT%.
endlocal
