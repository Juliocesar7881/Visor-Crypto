# Publish Macro API to GitHub
# Este script prepara e publica a macro-api no GitHub

param(
    [string]$GitHubUsername = ""
)

Write-Host "📊 Publicando Macro API no GitHub" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

# Verificar se Git está instalado
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Git não encontrado. Instale em https://git-scm.com/" -ForegroundColor Red
    exit 1
}

# Pedir username se não fornecido
if (-not $GitHubUsername) {
    $GitHubUsername = Read-Host "Digite seu username do GitHub"
}

if (-not $GitHubUsername) {
    Write-Host "❌ Username do GitHub é obrigatório" -ForegroundColor Red
    exit 1
}

$macroApiPath = Join-Path $PSScriptRoot "macro-api"

# Verificar se a pasta existe
if (-not (Test-Path $macroApiPath)) {
    Write-Host "❌ Pasta macro-api não encontrada" -ForegroundColor Red
    exit 1
}

Set-Location $macroApiPath

# Gerar dados iniciais
Write-Host "`n📥 Gerando dados iniciais..." -ForegroundColor Yellow
npm install
node fetch-macro-data.js

# Inicializar Git se necessário
if (-not (Test-Path ".git")) {
    Write-Host "`n🔧 Inicializando repositório Git..." -ForegroundColor Yellow
    git init
}

# Verificar se remote existe
$remoteExists = git remote -v 2>$null | Select-String "origin"
if (-not $remoteExists) {
    $repoUrl = "https://github.com/$GitHubUsername/macro-api.git"
    Write-Host "`n🔗 Adicionando remote: $repoUrl" -ForegroundColor Yellow
    git remote add origin $repoUrl
}

# Adicionar arquivos
Write-Host "`n📦 Preparando arquivos para commit..." -ForegroundColor Yellow
git add .
git commit -m "📊 Initial commit - Macro API for Visor Crypto" 2>$null

# Push
Write-Host "`n🚀 Enviando para o GitHub..." -ForegroundColor Yellow
git branch -M main
git push -u origin main

Write-Host "`n✅ Publicado com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Próximos passos:" -ForegroundColor Cyan
Write-Host "1. Acesse: https://github.com/$GitHubUsername/macro-api/settings/pages"
Write-Host "2. Em 'Source', selecione 'Deploy from a branch'"
Write-Host "3. Selecione branch 'main' e pasta '/ (root)'"
Write-Host "4. Clique em 'Save'"
Write-Host ""
Write-Host "5. Acesse: https://github.com/$GitHubUsername/macro-api/actions"
Write-Host "6. Execute o workflow 'Update Macro Data'"
Write-Host ""
Write-Host "📡 Seu endpoint será:" -ForegroundColor Green
Write-Host "   https://$GitHubUsername.github.io/macro-api/data/macro-data.json"
Write-Host ""

# Atualizar a URL no macro-section.js
$macroSectionPath = Join-Path $PSScriptRoot "www\macro-section.js"
if (Test-Path $macroSectionPath) {
    Write-Host "🔧 Atualizando URL no macro-section.js..." -ForegroundColor Yellow
    $content = Get-Content $macroSectionPath -Raw
    $newUrl = "https://$GitHubUsername.github.io/macro-api/data/macro-data.json"
    $content = $content -replace "SEU_USUARIO\.github\.io/macro-api", "$GitHubUsername.github.io/macro-api"
    $content = $content -replace "SEU_USUARIO/macro-api", "$GitHubUsername/macro-api"
    Set-Content $macroSectionPath -Value $content
    
    # Copiar para visor-crypto-apk também
    $apkMacroSectionPath = Join-Path $PSScriptRoot "visor-crypto-apk\www\macro-section.js"
    if (Test-Path (Split-Path $apkMacroSectionPath)) {
        Copy-Item $macroSectionPath $apkMacroSectionPath -Force
    }
    
    Write-Host "✅ URLs atualizadas!" -ForegroundColor Green
}

Write-Host ""
Write-Host "🎉 Configuração completa!" -ForegroundColor Green
