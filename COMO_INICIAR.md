# 🚀 INICIAR TRADEBOT AI

## ⚡ Método MAIS FÁCIL (Duplo Clique)

### Windows:
1. **Duplo clique em:** `INICIAR_APP.bat`
2. Pronto! O backend inicia e o dashboard abre automaticamente!

---

## 🔧 Método Manual (Terminal)

### 1️⃣ Iniciar Backend
```powershell
cd "c:\Users\Luchini\Downloads\App para pagar\backend"
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Aguarde ver:** `Application startup complete.`

### 2️⃣ Abrir Dashboard
- Duplo clique em `dashboard.html` OU
- Acesse: http://localhost:8000/static/dashboard.html

---

## ✅ Como Saber se Está Funcionando?

### Backend está OK quando:
- ✅ Terminal mostra: `Application startup complete.`
- ✅ Dashboard mostra: "● Backend Conectado" (verde)
- ✅ http://localhost:8000/health retorna JSON

### Backend NÃO está OK quando:
- ❌ Terminal fechou sozinho
- ❌ Dashboard mostra: "● Backend Desconectado" (vermelho)
- ❌ Erro de conexão no navegador

---

## 🧪 Testar Conexão

### Opção 1: Teste Visual
1. Abra `test-connection.html` (duplo clique)
2. Veja se todos os 4 testes passam ✅

### Opção 2: Teste Manual (PowerShell)
```powershell
Invoke-WebRequest http://localhost:8000/health
```

Se retornar JSON = está funcionando! 🎉

---

## 🐛 Problemas Comuns

### "Backend Desconectado"
**Causa:** Backend não está rodando ou porta 8000 ocupada

**Solução:**
```powershell
# Matar processo na porta 8000
Get-Process -Name python | Stop-Process -Force

# Iniciar novamente
cd backend
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### "CORS Error"
**Causa:** Acesso de origem diferente

**Solução:** O dashboard DEVE ser aberto:
- ✅ Via duplo clique no arquivo
- ✅ Via file:/// no navegador
- ✅ Via http://localhost:8000/static/dashboard.html
- ❌ NÃO abrir de outro domínio

### Dashboard não atualiza
**Solução:** CTRL + F5 (force refresh no navegador)

---

## 📊 URLs Importantes

- **Backend API:** http://localhost:8000
- **Docs Interativa:** http://localhost:8000/docs
- **Health Check:** http://localhost:8000/health
- **Status do Bot:** http://localhost:8000/api/bot/status
- **Dashboard Web:** file:///dashboard.html ou http://localhost:8000/static/dashboard.html

---

## 🎯 Passo a Passo COMPLETO (5 minutos)

1. **Abrir PowerShell**
2. **Copiar e colar:**
```powershell
cd "c:\Users\Luchini\Downloads\App para pagar\backend"
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
3. **Aguardar mensagem:** `Application startup complete.`
4. **Abrir nova aba do navegador**
5. **Duplo clique em:** `dashboard.html`
6. **Verificar:** Bolinha verde "Backend Conectado"
7. **Testar:** Clicar em "Iniciar Bot"
8. **Sucesso!** 🎉

---

## 🔥 Dica PRO

**Deixe o terminal do backend ABERTO!**
- NÃO feche a janela do PowerShell
- O backend precisa ficar rodando em background
- Você verá logs em tempo real dos requests

---

## 💡 Atalhos

| Ação | Atalho |
|------|--------|
| Iniciar tudo | Duplo clique `INICIAR_APP.bat` |
| Testar conexão | Duplo clique `test-connection.html` |
| Ver API docs | http://localhost:8000/docs |
| Dashboard | Duplo clique `dashboard.html` |

---

## ✅ Checklist Rápido

- [ ] Backend rodando (terminal aberto)
- [ ] Mensagem `Application startup complete.`
- [ ] Dashboard aberto no navegador
- [ ] Bolinha verde "Backend Conectado"
- [ ] Pode clicar em "Iniciar Bot"

**Se todos ✅ = ESTÁ FUNCIONANDO!** 🚀
