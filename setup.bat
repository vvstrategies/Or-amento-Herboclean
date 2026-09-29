@echo off
REM Script de configuração inicial do projeto

echo.
echo ========================================
echo  Gerador de Orçamentos - Setup
echo ========================================
echo.

echo Verificando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js não encontrado. Por favor instale em: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js encontrado

echo.
echo Instalando dependências...
call npm install

echo.
echo ========================================
echo ✅ Setup concluído com sucesso!
echo ========================================
echo.
echo Próximos passos:
echo 1. Abra o arquivo .env
echo 2. Adicione sua chave da API Anthropic
echo 3. Execute: npm start
echo.
echo Para obter sua chave API:
echo https://console.anthropic.com/
echo.
pause
