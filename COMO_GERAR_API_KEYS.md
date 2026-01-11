# 🔑 Como Gerar Chaves de API para Conectar Exchange

## Por que preciso de chaves de API?

As exchanges **não permitem login direto** de apps terceiros por segurança. Em vez disso, você gera **chaves de API** que são como "senhas especiais" que você pode:
- ✅ Revogar a qualquer momento
- ✅ Controlar permissões (só trading, só leitura, etc)
- ✅ Usar em múltiplos apps

---

## 🏦 BINANCE

### Passo a Passo:

1. **Acesse:** https://www.binance.com/en/my/settings/api-management
2. **Faça Login** na sua conta Binance
3. **Clique em "Create API"**
4. **Dê um nome:** Ex: "TradeBot AI"
5. **Configure Permissões:**
   - ✅ Enable Reading (obrigatório)
   - ✅ Enable Spot & Margin Trading (para operar)
   - ❌ Enable Withdrawals (NÃO marque por segurança!)
6. **Copie a API Key** (começa com algo como `a1b2c3...`)
7. **Copie o Secret** (aparece UMA VEZ APENAS - salve!)
8. **Cole no TradeBot AI**

### 🔒 Segurança:
- **NUNCA compartilhe** sua API Secret
- **Restrinja IPs** se possível (opcional mas recomendado)
- **Desabilite Withdrawals** - app só precisa operar, não sacar

---

## 🪙 COINBASE

### Passo a Passo:

1. **Acesse:** https://www.coinbase.com/settings/api
2. **Faça Login** na sua conta Coinbase
3. **Clique em "New API Key"**
4. **Selecione Permissões:**
   - ✅ View (necessário)
   - ✅ Trade (necessário)
   - ❌ Transfer (NÃO marque!)
5. **Copie API Key** e **Secret**
6. **Cole no TradeBot AI**

---

## 🐙 KRAKEN

### Passo a Passo:

1. **Acesse:** https://www.kraken.com/u/security/api
2. **Faça Login** na sua conta Kraken
3. **Clique em "Generate New Key"**
4. **Dê um nome:** Ex: "TradeBot AI"
5. **Configure Permissões:**
   - ✅ Query Funds
   - ✅ Query Open Orders & Trades
   - ✅ Create & Modify Orders
   - ❌ Withdraw Funds
6. **Copie API Key** e **Private Key**
7. **Cole no TradeBot AI**

---

## 🚀 BYBIT

### Passo a Passo:

1. **Acesse:** https://www.bybit.com/app/user/api-management
2. **Faça Login** na sua conta Bybit
3. **Clique em "Create New Key"**
4. **Selecione Tipo:** API Transaction (não Sub Account)
5. **Configure Permissões:**
   - ✅ Read-Write (necessário para trading)
   - ❌ IP Restrictions (opcional mas recomendado)
6. **Copie API Key** e **Secret Key**
7. **Cole no TradeBot AI**

---

## 🔄 OKX

### Passo a Passo:

1. **Acesse:** https://www.okx.com/account/my-api
2. **Faça Login** na sua conta OKX
3. **Clique em "Create API Key"**
4. **Dê um nome:** Ex: "TradeBot AI"
5. **Configure Permissões:**
   - ✅ Read
   - ✅ Trade
   - ❌ Withdraw
6. **Copie API Key**, **Secret Key** e **Passphrase**
7. **Cole no TradeBot AI**

⚠️ **OKX usa Passphrase adicional** - salve também!

---

## 🛡️ DICAS DE SEGURANÇA

### ✅ **FAÇA:**
- Use API keys **somente para trading**
- Desabilite **withdrawals/saques**
- Salve as chaves em **local seguro** (gerenciador de senhas)
- Revogue chaves antigas que não usa mais
- Use **2FA (autenticação em 2 fatores)** na exchange

### ❌ **NÃO FAÇA:**
- Compartilhar suas chaves com ninguém
- Enviar chaves por email/mensagem
- Dar permissão de **withdrawal/saque**
- Usar a mesma chave em múltiplos apps não confiáveis
- Tirar print/foto das chaves

---

## ⚠️ ATENÇÃO: Secret só aparece UMA VEZ!

Quando você cria uma API Key, o **Secret/Private Key aparece apenas UMA VEZ**. Se perder:
1. **Não tem como recuperar**
2. Você precisa **deletar** a chave antiga
3. E **criar uma nova**

💡 **Dica:** Salve no seu gerenciador de senhas ANTES de fechar a página!

---

## 🔧 TROUBLESHOOTING

### "API Key inválida"
- ✅ Verifique se copiou corretamente (sem espaços extras)
- ✅ Confirme que deu permissões de **trading**
- ✅ Aguarde 1-2 minutos após criar (algumas exchanges demoram)

### "IP não autorizado"
- ✅ Se configurou restrição de IP, adicione o IP do app
- ✅ Ou remova restrições de IP (menos seguro mas funciona)

### "Permissão negada"
- ✅ Certifique-se que marcou **Enable Trading**
- ✅ Verifique se sua conta exchange está verificada (KYC)

---

## 📱 TESTANDO NO APP

Após conectar:
1. **Vá na tab "Conta"**
2. **Troque para "Exchange Real"**
3. **Veja seu saldo** da exchange aparecer
4. **Pronto!** Bot pode operar na sua conta

---

## 🤔 PERGUNTAS FREQUENTES

### **Q: O app vai roubar meu dinheiro?**
**A:** NÃO. Se você:
- ❌ NÃO deu permissão de **withdrawal**
- ✅ Apenas marcou **trading**

O app **fisicamente não consegue** sacar fundos. Só pode comprar/vender.

### **Q: E se eu quiser desconectar?**
**A:** Você pode:
1. **No app:** Tab Conta > Desconectar
2. **Na exchange:** Deletar/revogar a API Key

### **Q: Qual exchange é melhor?**
**A:** Depende do seu país:
- 🇧🇷 **Brasil:** Binance ou Mercado Bitcoin
- 🇺🇸 **EUA:** Coinbase ou Kraken
- 🌍 **Global:** Binance (maior liquidez)

### **Q: Posso usar Testnet?**
**A:** SIM! Binance e Bybit têm **testnet** (dinheiro fake):
- Binance Testnet: https://testnet.binance.vision/
- Bybit Testnet: https://testnet.bybit.com/

Marque a opção "Testnet" ao conectar!

---

## 💡 DICA PROFISSIONAL

**Comece com Paper Trading:**
1. Use a conta **Paper Trading** primeiro (dinheiro virtual)
2. Teste o bot por **1 semana**
3. Veja se gosta dos resultados
4. **Depois** conecte exchange real

**Não tenha pressa!** É melhor testar bem antes de arriscar dinheiro real.

---

## 📞 PRECISA DE AJUDA?

Se tiver dificuldades:
1. Revise este guia passo-a-passo
2. Assista tutoriais no YouTube da exchange
3. Entre em contato com suporte da exchange
4. Use o **Paper Trading** enquanto isso!

---

**Última atualização:** Novembro 2025
