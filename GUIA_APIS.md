# 🔑 GUIA COMPLETO - APIs Necessárias

## 📊 5 ABAS DO APP - APIs Necessárias

### 1. 🐋 ABA: BALEIAS + NOTÍCIAS
**Monitorar transações de instituições + Notícias em tempo real**

#### APIs Necessárias:
- **Arkham Intelligence** (Baleias)
  - Link: https://platform.arkhamintelligence.com/
  - Cadastro: Grátis → API Keys
  - **ME ENVIE:** `ARKHAM_API_KEY=xxxxx`

- **CryptoPanic** (Notícias + Sentimento)
  - Link: https://cryptopanic.com/developers/api/
  - Plano FREE: 200 requests/dia
  - **ME ENVIE:** `CRYPTOPANIC_API_KEY=xxxxx`

---

### 2. 🤖 ABA: ROBÔ
**Configurar e operar bot de trading**

#### APIs Necessárias:
- **Binance** (já configurado WebSocket)
  - Link: https://www.binance.com/en/my/settings/api-management
  - ⚠️ **IMPORTANTE:** Crie com **apenas permissão READ** para teste
  - **ME ENVIE:**
    - `BINANCE_API_KEY=xxxxx`
    - `BINANCE_API_SECRET=xxxxx`

---

### 3. 📊 ABA: RELATÓRIOS + HEATMAP
**Visualizar momento do mercado**

#### APIs Necessárias:
- **CoinGecko** (Dados de mercado)
  - Link: https://www.coingecko.com/en/api
  - Plano FREE: 50 requests/min (suficiente!)
  - **OPCIONAL:** `COINGECKO_API_KEY=xxxxx`

- **Fear & Greed Index** (FREE - sem chave)
  - https://alternative.me/crypto/

- **TradingView Heatmap** (Embedded - FREE)
  - Sem cadastro necessário

---

### 4. 📈 ABA: ANÁLISE GRÁFICA
**Cruzamento de médias, RSI, MACD, etc**

#### APIs/Ferramentas:
- **Binance API** (mesma chave da aba 2)
- **TA-Lib** (Python - cálculos locais)
- **TradingView Charts** (Embedded - FREE)

---

### 5. 🔔 NOTIFICAÇÕES PUSH
**Firebase Cloud Messaging**

- Link: https://console.firebase.google.com/
- Criar projeto → Cloud Messaging
- **ME ENVIE:** arquivo `serviceAccountKey.json`

---

## 🎯 CADASTRE ESTAS 3 ESSENCIAIS:

### ✅ 1. ARKHAM (Baleias)
```
1. Acesse: https://platform.arkhamintelligence.com/
2. Cadastre com Google/Email
3. Vá em "API Keys" no menu
4. Clique "Create New API Key"
5. Copie a chave gerada
```

### ✅ 2. CRYPTOPANIC (Notícias)
```
1. Acesse: https://cryptopanic.com/developers/api/
2. Clique "Get Free API Key"
3. Preencha formulário (pode usar Free tier)
4. Confirme email
5. Copie sua API Key
```

### ✅ 3. BINANCE (Trading)
```
1. Login na Binance
2. Perfil → API Management
3. Create API (Label: "TradeBot Test")
4. ⚠️ MARQUE APENAS: "Enable Reading"
5. Copie API Key e Secret Key
6. ⚠️ Salve o Secret (aparece só 1 vez!)
```

---

## 📝 ME ENVIE NESTE FORMATO:

```env
# Cole aqui quando tiver:

ARKHAM_API_KEY=ark_xxxxxxxxxxxxxxxxx
CRYPTOPANIC_API_KEY=xxxxxxxxxxxxxxxxxxxxxx
BINANCE_API_KEY=xxxxxxxxxxxxxxxxxxxxxx
BINANCE_API_SECRET=xxxxxxxxxxxxxxxxxxxxxx
COINGECKO_API_KEY=CG-xxxxxxxxxxxxx (opcional)
```

---

## 💰 QUANTO CUSTA?

| API | Plano FREE | Limite | Custo PRO |
|-----|-----------|--------|-----------|
| Arkham | ✅ Sim | 100/dia | $49/mês |
| CryptoPanic | ✅ Sim | 200/dia | $19/mês |
| Binance | ✅ Sim | 1200/min | Grátis |
| CoinGecko | ✅ Sim | 50/min | $99/mês |
| Firebase | ✅ Sim | Ilimitado | Grátis |

**TOTAL PARA COMEÇAR: R$ 0,00** 🎉

Planos FREE são suficientes para uso pessoal!

---

## ⏱️ TEMPO PARA CADASTRAR:

- Arkham: ~3 minutos
- CryptoPanic: ~2 minutos  
- Binance: ~5 minutos (se já tem conta: 2 min)

**TOTAL: ~10 minutos** ⚡

---

## 🚀 PRÓXIMOS PASSOS:

1. **Cadastre nas 3 APIs essenciais** (links acima)
2. **Cole as chaves aqui** no formato mostrado
3. **Eu configuro tudo automaticamente!**
4. **App fica 100% funcional** com dados reais!

---

## 🎁 BÔNUS - O QUE VOCÊ TERÁ:

✅ Monitoramento de carteiras BlackRock, Grayscale, etc  
✅ Notícias em tempo real com sentimento (positivo/negativo)  
✅ Alertas push quando baleia move > $10M  
✅ Heatmap visual do mercado  
✅ Gráficos com EMA, RSI, MACD automáticos  
✅ Bot de trading com sinais em tempo real  
✅ Relatórios de momento (Fear & Greed)  

**Tudo integrado nas 5 abas do app! 📱**

---

## ❓ DÚVIDAS COMUNS:

**Q: Precisa cartão de crédito?**  
A: Não! Todos os planos FREE não pedem cartão.

**Q: Binance API é seguro?**  
A: Sim! Com permissão apenas de READ, não pode executar ordens.

**Q: Posso testar sem cadastrar?**  
A: Sim! App funciona com dados simulados, mas cadastrando fica real.

**Q: Quanto tempo as chaves valem?**  
A: Indefinidamente (até você revogar).

---

**Cadastre agora e me envie as chaves! Vou configurar tudo! 🚀**
