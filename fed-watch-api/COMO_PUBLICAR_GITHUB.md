# 🚀 Como Publicar o Fed Watch API no GitHub

## Passo 1: Criar Repositório no GitHub

1. Acesse [github.com](https://github.com) e faça login
2. Clique no **+** no canto superior direito → **New repository**
3. Nome do repositório: `fed-watch-api`
4. Descrição: `API gratuita para dados do Fed Watch`
5. Marque como **Public** (necessário para GitHub Pages gratuito)
6. **NÃO** inicialize com README (já temos um)
7. Clique em **Create repository**

## Passo 2: Fazer Upload dos Arquivos

### Opção A: Via Git (linha de comando)

```powershell
# Navegar até a pasta
cd "c:\Users\Luchini\Downloads\App para pagar\fed-watch-api"

# Inicializar Git
git init

# Adicionar todos os arquivos
git add .

# Fazer commit
git commit -m "Initial commit - Fed Watch API"

# Adicionar remote (substitua SEU_USUARIO pelo seu usuário)
git remote add origin https://github.com/SEU_USUARIO/fed-watch-api.git

# Fazer push
git branch -M main
git push -u origin main
```

### Opção B: Via Interface Web (mais fácil)

1. Na página do repositório recém-criado, clique em **uploading an existing file**
2. Arraste TODOS os arquivos da pasta `fed-watch-api`:
   - `.github/workflows/update-fed-data.yml`
   - `package.json`
   - `fetch-fed-data.js`
   - `data/fed-watch.json`
   - `README.md`
3. Clique em **Commit changes**

## Passo 3: Habilitar GitHub Pages

1. Vá em **Settings** (ícone de engrenagem)
2. No menu lateral, clique em **Pages**
3. Em **Source**, selecione:
   - Branch: `main`
   - Folder: `/ (root)`
4. Clique em **Save**
5. Aguarde 2-3 minutos

## Passo 4: Verificar se Está Funcionando

Após alguns minutos, seu JSON estará disponível em:
```
https://SEU_USUARIO.github.io/fed-watch-api/data/fed-watch.json
```

Teste abrindo esse URL no navegador!

## Passo 5: Verificar GitHub Actions

1. Vá na aba **Actions** do repositório
2. Você deve ver o workflow "Update Fed Watch Data"
3. Clique em "Run workflow" para testar manualmente
4. O workflow rodará automaticamente a cada 30 minutos

## Passo 6: Atualizar o App

Depois de publicar, me informe seu nome de usuário do GitHub para eu atualizar o app com a URL correta!

## 📋 Checklist

- [ ] Repositório criado no GitHub
- [ ] Arquivos enviados
- [ ] GitHub Pages habilitado
- [ ] JSON acessível via URL
- [ ] GitHub Actions funcionando
- [ ] App atualizado com nova URL

## ⚠️ Importante

- O repositório DEVE ser público para GitHub Pages gratuito
- O workflow usa 2000 minutos grátis por mês (mais que suficiente)
- Os dados são atualizados a cada 30 minutos automaticamente
- Não precisa manter nenhum PC ligado!
