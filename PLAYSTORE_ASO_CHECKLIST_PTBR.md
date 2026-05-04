# Play Store Pre-Launch + ASO (PT-BR)

Este documento junta o que falta antes da publicacao e um pacote ASO pronto para aumentar descoberta e conversao.

## 0) O que acontece na pratica

Se voce fizer tudo deste plano, o resultado esperado e:

1. O app continua funcionando normalmente para usuario final.
2. A chance de rejeicao na Play Store cai (compliance mais forte).
3. O risco de indisponibilidade por segredo exposto diminui.
4. A descoberta organica melhora com ASO e criativos melhores.

Nada deve "parar" por causa do checklist em si. O que pode causar problema e erro de execucao no passo de rotacao de chaves.

Riscos reais e como evitar:

1. Rotacionar chave no provedor e esquecer de atualizar no Worker: endpoints podem retornar 401/500.
2. Atualizar chave no Worker com valor errado: degradacao parcial de dados externos.
3. Publicar sem validar trilha interna: bugs so aparecem em producao.

Mitigacao simples:

1. Rotacionar chave por chave (uma de cada vez).
2. Atualizar segredo e testar endpoint antes da proxima rotacao.
3. So depois promover para Closed/Production.

## 1) Bloqueadores antes de publicar

1. Configurar secrets no Cloudflare Worker (obrigatorio) - CONCLUIDO e validado em 2026-03-13:
   - `wrangler secret put FMP_API_KEY`
   - `wrangler secret put FRED_API_KEY`
2. Rotacionar todas as chaves antigas que ja foram expostas no passado - EM ANDAMENTO:
   - Repositorio saneado (arquivo sensivel removido e ignorado no git).
   - Falta concluir rotacao no painel de cada provedor (FMP/FRED/GROQ e chave de assinatura Android).
3. Publicar politica de privacidade em URL publica HTTPS (nao apenas arquivo local) - CONCLUIDO.
   - URL publicada: `https://visor-crypto-privacy-policy.pages.dev/`
4. Conferir Data safety form no Play Console (coleta/uso de dados e compartilhamento) - PENDENTE (manual).
5. Revisar permissoes declaradas para nao reprovar em politica de foreground service - PENDENTE (manual no Play Console).
6. Subir primeiro em `Internal testing` e depois `Closed testing` - PENDENTE (manual).

### Status tecnico atual (2026-03-13)

- Worker publicado em producao e operacional.
- Secrets FMP/FRED/GROQ configurados no Worker.
- Endpoint IA `/ai-summary` validado em producao.
- Build release atualizado para `versionCode 101` e `versionName 1.0.1`.
- Artefato pronto para upload: `android/app/build/outputs/bundle/release/app-release.aab`.
- Politica de privacidade publicada e acessivel.
- Foreground service ajustado para conformidade: inicio por opt-in do usuario e restart no boot apenas quando habilitado.

### Execucao agora (passo 1 e 2)

1. Passo 1 executado: segredos ativos confirmados via `wrangler secret list`.
2. Passo 2 executado no que e automatizavel: saneamento no repositorio concluido.
3. Restante do passo 2 depende de acesso aos paineis externos para gerar novas chaves e substituir as antigas.

### Pendencias que so voce consegue finalizar no Play Console

1. App content > Data safety.
2. App content > Content rating.
3. App content > Target audience and content.
4. Policy > Foreground service declaration (justificar `dataSync`).
5. Production > Store listing (titulo, descricao, screenshots, icone).
6. Test and release > Internal testing (subir AAB), depois Closed testing.

## 2) ASO: fundamentos que mais movem instalacao

1. Conversao de listing (CVR) decide ranking.
2. Retencao D1/D7 e nota media impactam distribuicao organica.
3. Keywords em titulo e descricao curta sao mais fortes que keyword stuffing na descricao longa.
4. Screenshots e video curto mudam muito mais que texto sozinho.

## 3) Pacote ASO pronto (PT-BR)

### 3.1 Titulos (max 30 chars)

Opcao A: `Visor Crypto: Sinais e IA`
Opcao B: `Visor Crypto: Trading e IA`
Opcao C: `Visor Crypto: Analise Real`

Recomendacao inicial: Opcao A.

### 3.2 Descricao curta (max 80 chars)

Opcao A:
`Sinais cripto em tempo real com IA, mapa de liquidacoes, noticias e alertas.`

Opcao B:
`Bitcoin e altcoins com analise tecnica, IA, macro dados e alertas em tempo real.`

Recomendacao inicial: Opcao A.

### 3.3 Descricao longa (base)

`Visor Crypto e um app de monitoramento e analise de criptoativos para quem busca leitura rapida de mercado em tempo real.

Com o app voce acompanha Bitcoin, Ethereum e altcoins com sinais de direcao, confianca, probabilidade, fluxo de mercado e mapa de risco de liquidacoes pendentes.

Principais recursos:
- Sinais de mercado com IA e analise tecnica
- Mapa de liquidacoes com atualizacao recorrente
- Precos e variacao em tempo real
- Indicadores tecnicos e leitura de confluencia
- Noticias cripto filtradas e organizadas
- Camada macroeconomica (DXY, VIX, juros, dados de risco)
- Alertas e monitoramento continuo

Para quem e:
- Traders e investidores que querem contexto rapido
- Usuarios que acompanham BTC, ETH e principais altcoins
- Quem precisa de sinais + contexto tecnico + macro no mesmo app

Importante:
Este app tem finalidade informativa e educacional. Nao constitui recomendacao de investimento. Criptoativos envolvem alto risco e volatilidade.`

## 4) Keywords alvo (PT-BR)

Use naturalmente no texto, sem repeticao forcada:

- sinais cripto
- sinais bitcoin
- analise tecnica cripto
- trading crypto
- alerta bitcoin
- mapa de liquidacoes
- noticias cripto
- mercado crypto em tempo real
- app de criptomoedas
- previsao bitcoin

## 5) Criativos da loja (ordem de screenshots)

1. Tela 1: valor principal
   - Copy: `Sinais cripto em tempo real com IA`
2. Tela 2: mapa de liquidacoes
   - Copy: `Veja onde o risco esta concentrado`
3. Tela 3: confluencia tecnica
   - Copy: `Confianca e probabilidade em cada sinal`
4. Tela 4: noticias e macro
   - Copy: `Contexto de mercado em segundos`
5. Tela 5: alertas
   - Copy: `Receba alertas e aja no tempo certo`

## 6) Experimentos A/B no Play Console

Rodar por pelo menos 7 a 14 dias cada teste:

1. Teste de icone: 2 variacoes.
2. Teste de descricao curta: opcao A vs B.
3. Teste de screenshot capa: foco em IA vs foco em tempo real.

KPI principal: `First-time installers per store listing visitors`.

## 7) Crescimento organico (nao pago)

1. Pedir review no momento certo (apos experiencia positiva, nao no primeiro minuto).
2. Responder reviews em ate 24-48h.
3. Fazer update quinzenal com release notes reais.
4. Criar localizacoes: `pt-BR` (principal), `en-US`, `es-419`.

## 8) Checklist final de publicacao

1. AAB release atualizado e assinado.
2. Politica de privacidade publica e acessivel.
3. Data safety preenchido corretamente.
4. Content rating concluido.
5. Target audience + ads policy conferidos.
6. Store listing final com keywords alvo.
7. 5+ screenshots e, se possivel, video curto de 20-30s.
8. Lancar em trilha interna/fechada antes de producao.

## 9) Realidade sobre "usuarios automaticamente"

Nao existe crescimento infinito automatico apenas com ASO. O que funciona e:

1. ASO forte para melhorar descoberta e conversao.
2. Produto bom para manter retencao e nota alta.
3. Ciclo continuo de experimento e melhoria (semanal).

Esse combo sim gera crescimento organico consistente.
