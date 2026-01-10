# Visor Crypto - Publish to GitHub
# Execute após criar o repositório no GitHub

Write-Host "Visor Crypto - Publish to GitHub" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

$githubUser = Read-Host "Digite seu username do GitHub (Enter para 'Juliocesar7881')"
if ([string]::IsNullOrWhiteSpace($githubUser)) {
    $githubUser = "Juliocesar7881"
}

$repoName = Read-Host "Digite o nome do repositorio (Enter para 'visor-crypto-app')"
if ([string]::IsNullOrWhiteSpace($repoName)) {
    $repoName = "visor-crypto-app"
}

Write-Host ""
Write-Host "Configuracao:" -ForegroundColor Yellow
Write-Host "  Username: $githubUser"
Write-Host "  Repository: $repoName"
Write-Host "  URL: https://github.com/$githubUser/$repoName"
Write-Host ""

$confirm = Read-Host "Continuar? (s/n)"
if ($confirm -ne 's') {
    Write-Host "Operacao cancelada" -ForegroundColor Red
    exit
}

Write-Host ""
Write-Host "IMPORTANTE: Crie o repositorio no GitHub primeiro!" -ForegroundColor Yellow
Write-Host "  1. Acesse: https://github.com/new"
Write-Host "  2. Crie o repositorio VAZIO (sem README)"
Write-Host ""

$ready = Read-Host "Repositorio criado no GitHub? (s/n)"
if ($ready -ne 's') {
    Write-Host ""
    Write-Host "Crie o repositorio e execute novamente!" -ForegroundColor Cyan
    exit
}

Write-Host ""
Write-Host "Adicionando remote..." -ForegroundColor Green
git remote add origin "https://github.com/$githubUser/$repoName.git" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Remote ja existe, atualizando URL..." -ForegroundColor Yellow
    git remote set-url origin "https://github.com/$githubUser/$repoName.git"
}

Write-Host "Fazendo push..." -ForegroundColor Green
git push -u origin master

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "SUCESSO! Projeto publicado!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Links:" -ForegroundColor Yellow
    Write-Host "  Repositorio: https://github.com/$githubUser/$repoName"
    Write-Host "  Releases: https://github.com/$githubUser/$repoName/releases/new"
    Write-Host ""
    
    $createTag = Read-Host "Criar tag v1.0? (s/n)"
    if ($createTag -eq 's') {
        git tag -a v1.0 -m "Visor Crypto v1.0 - Initial Release"
        git push origin v1.0
        Write-Host "Tag v1.0 criada!" -ForegroundColor Green
    }
    
    $openBrowser = Read-Host "Abrir no navegador? (s/n)"
    if ($openBrowser -eq 's') {
        Start-Process "https://github.com/$githubUser/$repoName"
    }
} else {
    Write-Host ""
    Write-Host "Erro ao fazer push!" -ForegroundColor Red
    Write-Host "Verifique suas credenciais do GitHub" -ForegroundColor Yellow
}
