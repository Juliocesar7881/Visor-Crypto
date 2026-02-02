# Script para publicar cmc-api no GitHub
# Execute este script no PowerShell

$repoName = "cmc-api"
$username = "LucianoSP"  # Substitua pelo seu username do GitHub

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Publicando $repoName no GitHub" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Verificar se estamos no diretório correto
if (-not (Test-Path "package.json")) {
    Write-Host "ERRO: Execute este script dentro da pasta cmc-api" -ForegroundColor Red
    exit 1
}

# Inicializar git
Write-Host "`n1. Inicializando repositório Git..." -ForegroundColor Yellow
git init

# Adicionar arquivos
Write-Host "`n2. Adicionando arquivos..." -ForegroundColor Yellow
git add .

# Commit inicial
Write-Host "`n3. Criando commit inicial..." -ForegroundColor Yellow
git commit -m "Initial commit - CMC API Backend"

# Definir branch main
git branch -M main

# Adicionar remote
Write-Host "`n4. Configurando remote..." -ForegroundColor Yellow
Write-Host "   Primeiro, crie o repositório no GitHub:" -ForegroundColor White
Write-Host "   https://github.com/new" -ForegroundColor Green
Write-Host "   Nome: $repoName" -ForegroundColor Green
Write-Host "   Visibilidade: Public" -ForegroundColor Green
Write-Host ""
Read-Host "Pressione ENTER após criar o repositório no GitHub"

git remote add origin "https://github.com/$username/$repoName.git"

# Push
Write-Host "`n5. Enviando para GitHub..." -ForegroundColor Yellow
git push -u origin main

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Repositório criado com sucesso!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Host "`n PRÓXIMOS PASSOS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Vá em: https://github.com/$username/$repoName/settings/secrets/actions" -ForegroundColor White
Write-Host "2. Clique em 'New repository secret'" -ForegroundColor White
Write-Host "3. Nome: CMC_API_KEY" -ForegroundColor Green
Write-Host "4. Valor: c3989cf0317a4eacbda6802f3c851a16" -ForegroundColor Green
Write-Host ""
Write-Host "5. Vá em: https://github.com/$username/$repoName/actions" -ForegroundColor White
Write-Host "6. Clique em 'I understand my workflows, go ahead and enable them'" -ForegroundColor White
Write-Host "7. Clique em 'Fetch CMC Data' -> 'Run workflow'" -ForegroundColor White
Write-Host ""
Write-Host "URL dos dados:" -ForegroundColor Cyan
Write-Host "https://raw.githubusercontent.com/$username/$repoName/main/data/cmc-data.json" -ForegroundColor Green
