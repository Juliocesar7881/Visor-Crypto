# Play Console - Copia e Cola (PT-BR)

Este arquivo resume apenas o que ainda e manual no Play Console.

## 1. Upload inicial

1. Ir em Test and release > Internal testing.
2. Criar release nova.
3. Upload do arquivo:
   - android/app/build/outputs/bundle/release/app-release.aab
4. Confirmar que a versao aparece como:
   - versionCode: 101
   - versionName: 1.0.1

## 2. Release notes (PT-BR)

Use este texto em "What is new":

Melhorias de estabilidade e desempenho geral.
Noticias com carregamento mais rapido e fallback reforcado.
Fed Watch com recuperacao mais robusta de dados.
Relatorio de IA integrado via Worker com maior confiabilidade.
Ajustes de seguranca e infraestrutura para release.

## 3. Data safety (preencher)

Preencher de acordo com o comportamento real do app no momento da publicacao.
Checklist minimo para nao esquecer:

1. Coleta de dados: revisar analytics, logs, notificacoes e ads.
2. Compartilhamento de dados: marcar somente o que realmente ocorre.
3. Criptografia em transito: marcar Sim se trafego usa HTTPS.
4. Exclusao de conta/dados: informar politica real do produto.
5. Link da politica de privacidade:
   - https://visor-crypto-privacy-policy.pages.dev/

Base tecnica detectada neste projeto (confira antes de enviar):

1. SDK de anuncios AdMob presente.
2. Permissao de notificacoes presente (POST_NOTIFICATIONS).
3. Foreground service ativo para sincronizacao em background (dataSync), iniciado por opt-in.
4. Cache local de dados de mercado e historico tecnico em armazenamento local do app.

Texto base sugerido para observacoes internas do formulario:

O aplicativo usa SDK de anuncios (AdMob), notificacoes locais e sincronizacao de dados de mercado em background. Dados tecnicos e de cache sao armazenados localmente no dispositivo para melhorar desempenho. Confirmar no formulario de Data Safety os itens coletados/compartilhados pelo SDK de anuncios conforme a documentacao oficial do Google Mobile Ads.

## 4. Foreground service declaration

O app declara foreground service do tipo dataSync.
No formulario de politica, descreva uso real e objetivo para o usuario.

Importante para conformidade:

- O servico so e iniciado apos acao explicita do usuario (opt-in).
- O servico mostra notificacao persistente enquanto ativo.
- O usuario pode parar manualmente o servico pelo app e pela acao "Parar" na notificacao.
- O restart em boot/update ocorre apenas se o usuario tiver habilitado previamente.

Texto base sugerido:

O aplicativo executa sincronizacao periodica de dados de mercado em foreground service tipo dataSync para manter alertas e sinais atualizados de forma confiavel. O servico e iniciado somente apos habilitacao explicita do usuario, exibe notificacao persistente enquanto ativo e pode ser interrompido a qualquer momento pelo usuario.

## 5. App content

Concluir estes formularios:

1. Content rating.
2. Target audience and content.
3. Ads declaration (se usa anuncios, marcar corretamente).

## 6. Store listing

Preencher e revisar:

1. Titulo.
2. Descricao curta.
3. Descricao completa.
4. 5+ screenshots.
5. Icone 512x512.
6. Feature graphic 1024x500.

## 7. Fluxo recomendado de publicacao

1. Internal testing (validar instalacao e comportamento).
2. Closed testing (coletar feedback real).
3. Production.
