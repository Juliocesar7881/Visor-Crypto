# Play Console - Copia e Cola (PT-BR)

Use este arquivo como fonte rapida para preencher a ficha do Visor Crypto no Google Play Console.

## Upload

1. Ir em `Test and release > Internal testing`.
2. Criar uma nova release.
3. Fazer upload do arquivo:
   - `android/app/build/outputs/bundle/release/app-release.aab`
4. Confirmar a versao:
   - `versionCode: 106`
   - `versionName: 1.0.0`

Se a Play Console mostrar aviso de simbolos nativos:

- Primeiro tente reenviar o AAB novo, gerado depois de ativar `debugSymbolLevel 'SYMBOL_TABLE'`.
- Se o aviso continuar, no Explorador de app bundles abra a versao enviada, va em Downloads/Recursos e envie:
  - `android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip`
- Esse aviso nao bloqueia a publicacao, mas ajuda a Play a mostrar crashes e ANRs nativos com mais detalhes.

## Nome do app

`Visor Crypto: Bitcoin`

Observacao: nome com 21 caracteres, dentro do limite de 30 caracteres da Play Store.

## Descricao curta

`Bitcoin, sinais cripto, notícias e macro em tempo real.`

## Descricao completa

`Visor Crypto: Bitcoin é um app para acompanhar criptomoedas, sinais de mercado, notícias cripto e indicadores macro em tempo real.

Com o Visor Crypto você acompanha Bitcoin, Ethereum e altcoins em uma leitura rápida para celular, com preços, variação, análise técnica, alertas, notícias filtradas e contexto macroeconômico.

Principais recursos:
- Preços de criptomoedas em tempo real
- Sinais cripto e análise técnica
- Notícias cripto filtradas por relevância
- Indicadores macro, VIX, S&P 500, dólar, energia e Fed Watch
- Fear & Greed e Altseason Index com fontes reais
- Alertas e acompanhamento de mercado
- Interface feita para leitura rápida no celular

Para quem e:
- Usuários que acompanham Bitcoin e altcoins
- Traders que precisam de contexto técnico e macro
- Investidores que querem notícias e sinais no mesmo app
- Pessoas que buscam uma visão organizada do mercado cripto

Importante:
O Visor Crypto tem finalidade informativa e educacional. O app não constitui recomendação de investimento, consultoria financeira ou promessa de resultado. Criptomoedas envolvem alto risco e alta volatilidade.`

## Keywords e tags

Use estas palavras de forma natural em screenshots, descricao e campanhas:

`bitcoin, cripto, criptomoedas, altcoins, sinais cripto, notícias cripto, análise técnica, preços de criptomoedas, mercado financeiro, macroeconomia, Fed Watch, Fear and Greed, Altseason Index`

Tags sugeridas no Play Console, conforme as opções disponíveis na sua conta:

`Finance, Cryptocurrency, Investment, News, Portfolio, Trading`

Hashtags apenas para divulgação fora da Play Store:

`#bitcoin #cripto #criptomoedas #altcoins #sinaiscripto #noticiascripto #analisetecnica #mercadocripto #fedwatch #altseason`

## Detalhes da release

Nome da versao:

`1.0.0 (106)`

Notas da versao:

`Primeira versao do Visor Crypto na Google Play.

- Acompanhamento de Bitcoin, altcoins e indicadores de mercado
- Secao Sinais com historico de calls e percentuais oficiais de 1h, 2h e 4h
- Noticias cripto filtradas por relevancia
- Indicadores macro, Fed Watch, Fear & Greed e Altseason Index
- Alertas e monitoramento de mercado quando habilitados pelo usuario
- Ajustes de estabilidade, privacidade e desempenho para lancamento`

## Data Safety

Preencher conforme o comportamento real no momento do envio.

Pontos que devem ser revisados:

1. O app usa AdMob.
2. O app pode usar notificacoes.
3. O app usa foreground service `dataSync` para sincronizacao quando o usuario habilita.
4. O app usa cache local para melhorar desempenho.
5. A politica de privacidade publica deve ser informada:
   - `https://visor-crypto-privacy-v2.pages.dev/`

Worker de producao validado:
   - `https://visor-crypto-calendar.visorcrypto.workers.dev`

Texto base para observacao interna:

`O aplicativo usa anuncios via Google AdMob, notificacoes e sincronizacao de dados de mercado quando habilitada pelo usuario. Dados tecnicos, cache local, identificador tecnico do dispositivo e token FCM podem ser usados para autenticar chamadas curtas, entregar notificacoes e evitar alertas duplicados. A declaracao de Data Safety deve refletir os dados tratados pelo SDK de anuncios e pelas funcionalidades ativas no app.`

## Foreground service declaration

Tipo declarado: `dataSync`

Texto sugerido:

`O aplicativo executa sincronizacao periodica de dados de mercado em foreground service do tipo dataSync para manter alertas e sinais atualizados de forma confiavel. O servico e iniciado somente apos habilitacao explicita do usuario, exibe notificacao persistente enquanto ativo e pode ser interrompido pelo usuario a qualquer momento.`

## Screenshots recomendados

1. Home/precos: `Bitcoin e altcoins em tempo real`
2. Sinais: `Sinais cripto e analise tecnica`
3. Noticias: `Noticias cripto filtradas por relevancia`
4. MACRO/Fed Watch: `Macro, VIX, S&P 500 e Fed Watch`
5. Alertas: `Alertas para acompanhar o mercado`

## Checklist manual

1. Subir AAB em teste interno.
2. Preencher Data Safety.
3. Declarar Ads/AdMob.
4. Preencher Financial Features sem prometer lucro ou recomendacao.
5. Preencher Foreground Service `dataSync`.
6. Preencher content rating.
7. Informar politica de privacidade publica.
8. Testar APK release em aparelho real antes de promover para producao.
