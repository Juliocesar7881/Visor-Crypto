# 🤖 TradeBot AI - Guia do Emulador Mobile

## ✅ Status Atual
- ✅ Backend rodando em `http://localhost:8000`
- ✅ Expo web rodando em `http://localhost:8081`
- ✅ Mobile simulator criado
- ✅ Extensions do VS Code instaladas

## 🚀 Como Testar a Aplicação

### 1. Verificar Serviços (já estão rodando)
```powershell
# Backend (já iniciado)
cd 'C:\Users\Luchini\Downloads\App para pagar\backend'
& '.\venv\Scripts\python.exe' -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Expo Web (já iniciado)  
cd 'C:\Users\Luchini\Downloads\App para pagar\mobile'
npx.cmd expo start --web --port 8081
```

### 2. Abrir o Simulador Mobile
- Abra o arquivo: `mobile-simulator.html` no seu navegador
- Ou use este link direto: `file:///c:/Users/Luchini/Downloads/App para pagar/mobile-simulator.html`

### 3. Configurar URLs no Simulador
- **Expo URL:** `http://localhost:8081`
- **Backend URL:** `http://localhost:8000`

### 4. Testes Disponíveis

#### 🔧 Botões de Teste Rápido:
- **💰 Balance** - Testa saldo da conta paper trading
- **📊 Symbols** - Lista símbolos disponíveis 
- **📈 Positions** - Lista posições abertas
- **🚀 Open Trade** - Abre posição BTC 2x de teste

#### 🎮 Funcionalidades do App:
1. **Saldo Virtual**: $10,000 inicial
2. **Abrir Posições**: BTC, ETH, SOL com alavancagem 1x, 2x, 5x
3. **Fechar Posições**: Com P&L calculado
4. **Relatórios**: Geração automática com RSI, MAs, notícias
5. **Reset**: Volta para $10,000

## 📱 Como Usar o Simulador

### Interface Principal:
```
┌─────────────────┐  ┌─────────────────┐
│   📱 EMULADOR   │  │   🔧 CONTROLES  │
│                 │  │                 │
│  [EXPO APP]     │  │  Expo URL: ___  │
│                 │  │  Backend: ___   │
│                 │  │                 │
│                 │  │  [🚀 Carregar]  │
│                 │  │  [🔄 Reload]    │
│                 │  │                 │
│                 │  │  💰📊📈🚀       │
│                 │  │  [Teste APIs]   │
└─────────────────┘  └─────────────────┘
```

### Fluxo de Teste:
1. ✅ Clique "🚀 Carregar App"
2. ✅ Teste "💰 Balance" (deve mostrar $10,000)
3. ✅ Clique "🚀 Open Trade" (abre BTC 2x)
4. ✅ Teste "📈 Positions" (deve mostrar a posição)
5. ✅ No app mobile, vá para aba "Conta"
6. ✅ Use "Fechar" na posição para gerar relatório

## 🐛 Troubleshooting

### App não carrega:
- Verifique se Expo está rodando: `http://localhost:8081`
- Recarregue com Ctrl+F5
- Tente mudar URL para `http://127.0.0.1:8081`

### Backend não responde:
```powershell
# Teste manual
Invoke-RestMethod 'http://localhost:8000/api/account/paper/balance'
```

### Expo/Metro problemas:
```powershell
# Limpar cache e reiniciar
cd mobile
npx.cmd expo start --clear --web --port 8081
```

## 📋 Endpoints Testados
- ✅ `GET /api/account/paper/balance` - Saldo
- ✅ `GET /api/bot/symbols` - Símbolos 
- ✅ `POST /api/account/paper/position` - Abrir posição
- ✅ `GET /api/account/paper/positions` - Listar posições
- ✅ `POST /api/account/paper/positions/{id}/close` - Fechar
- ✅ `GET /api/account/paper/reports` - Relatórios salvos
- ✅ `POST /api/account/paper/reset` - Reset conta

## 🎯 Funcionalidades Implementadas

### Backend:
- ✅ Paper trading com alavancagem
- ✅ Posições BTC/ETH/SOL (máx 5x)
- ✅ Cálculo P&L automático
- ✅ Relatórios com RSI, MAs, volume, notícias
- ✅ Storage persistente (JSON)
- ✅ Multi-timeframe analysis (1h, 4h, 1d)

### Mobile:
- ✅ Interface React Native + Expo
- ✅ Navegação com tabs
- ✅ Formulários de posição
- ✅ Lista de posições ativas
- ✅ Botões fechar/relatório
- ✅ Reset de conta

### Simulator:
- ✅ Frame de iPhone com tela
- ✅ Controles de teste de API
- ✅ Monitor de status backend
- ✅ Testes rápidos de endpoints
- ✅ Interface visual responsiva

## 🎮 Próximos Passos

Para estender a aplicação:
1. **Real-time prices**: WebSocket do Binance
2. **Mais indicadores**: MACD, Bollinger, Stochastic
3. **Smart Money Concept**: Order blocks, POI
4. **Backtesting**: Histórico de performance
5. **Push notifications**: Alertas mobile
6. **Exchange real**: Integração Binance/outras

Divirta-se testando! 🚀