# TradeBot AI - Script de Inicialização
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   TradeBot AI - Inicialização" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $baseDir "backend"

# Iniciar Backend
Write-Host "[1/2] Iniciando Backend FastAPI..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendDir'; .\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

# Aguardar backend iniciar
Write-Host "Aguardando backend iniciar..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Testar conexão
Write-Host "Testando conexão..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 5
    Write-Host "✅ Backend conectado!" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Backend ainda está iniciando..." -ForegroundColor Yellow
}

# Abrir Dashboard
Write-Host "[2/2] Abrindo Dashboard..." -ForegroundColor Yellow
$dashboardPath = Join-Path $baseDir "dashboard.html"
Start-Process $dashboardPath

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   ✅ App Iniciado com Sucesso!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backend:   http://localhost:8000" -ForegroundColor Cyan
Write-Host "API Docs:  http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "Dashboard: Aberto no navegador" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pressione qualquer tecla para sair..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
