@echo off
echo ========================================
echo    TradeBot AI - Inicializacao
echo ========================================
echo.

cd /d "%~dp0backend"

echo [1/2] Iniciando Backend FastAPI...
start "TradeBot Backend" cmd /k "venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 3 /nobreak >nul

echo [2/2] Abrindo Dashboard...
cd ..
start "" "dashboard.html"

echo.
echo ========================================
echo    Backend: http://localhost:8000
echo    Dashboard: Aberto no navegador
echo ========================================
echo.
echo Pressione qualquer tecla para sair...
pause >nul
