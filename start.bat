@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale Node.js 24 ou superior para abrir a Ecoclean.
  pause
  exit /b 1
)
if not exist "node_modules\dotenv" (
  echo As dependencias nao estao instaladas. Execute npm install nesta pasta.
  pause
  exit /b 1
)
node scripts\start-local.cjs
if errorlevel 1 (
  echo.
  echo Nao foi possivel abrir o sistema. Confira a mensagem acima.
  pause
  exit /b 1
)
endlocal
