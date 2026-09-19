# Appodeal - checklist da release 1.0.10 (138)

## 1. Conta e recebimento

1. A receita das redes operadas pela Appodeal aparece no saldo da conta Appodeal.
2. Em `Payouts > Change payment details`, cadastre o titular, o metodo de pagamento e o formulario fiscal aplicavel.
3. Para pessoa fisica fora dos EUA, normalmente a Appodeal solicita o formulario W-8BEN.
4. O pagamento minimo informado pela Appodeal e US$ 100 para PayPal ou ACH. Redes proprias vinculadas futuramente pagam separadamente.

## 2. Configuracao de monetizacao

1. Aplicativo Android: `com.visorcrypto.app`.
2. Formato integrado: somente `Interstitial`.
3. Integracao: Appodeal SDK 4.3.0, modo mediation only.
4. AdMob e Meta nao estao incluidos no APK e nao precisam ser conectados.
5. A App Key fica apenas em `android/monetization.properties`, ignorado pelo Git.

## 3. Limites implementados no app

- Nenhum banner ou anuncio ao abrir o aplicativo.
- Anuncio apenas em uma transicao natural para analise tecnica.
- Primeiro anuncio somente depois de quatro acoes elegiveis.
- Intervalo minimo de 20 minutos.
- Maximo de tres anuncios por dia no dispositivo.
- Nenhum anuncio interfere em notificacoes, sinais ou historico.

## 4. Teste antes da producao

1. Ative o modo de teste no painel/Appodeal somente durante a validacao.
2. Instale o APK release e abra a analise tecnica quatro vezes.
3. Confirme que o anuncio pode ser fechado e retorna ao ponto correto do app.
4. Desative o modo de teste antes da publicacao.
5. Em `Application Settings > Mediation Settings > Line Items`, confirme pelo menos duas ou tres redes ativas.

## 5. Play Console e privacidade

1. Em `Politica do app > Anuncios`, declare que o app contem anuncios.
2. Atualize `Seguranca dos dados` para publicidade, identificador de publicidade, interacoes, IP, localizacao aproximada inferida por IP e informacoes tecnicas processadas pela Appodeal/parceiros.
3. Informe `https://visor-crypto-privacy-v2.pages.dev/` como politica de privacidade.
4. Confirme classificacao indicativa e publico-alvo 18+.
5. Configure e publique `app-ads.txt` quando a Appodeal fornecer as linhas oficiais.

## 6. Artefato correto

- Versao: `1.0.10`
- Version code: `138`
- Upload para a Play Store: arquivo `.aab`
- APK: somente teste manual
- Notas globais: `playstore-assets/release-notes-1.0.10-138-all-locales.txt`
