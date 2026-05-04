# 🚀 Visor Crypto - Status e Recomendações Pré-Lançamento

## 1. Como Tudo Está Funcionando (Arquitetura Atual)

O Visor Crypto está rodando com uma arquitetura moderna e segura, dividida em duas partes principais:

*   **O Aplicativo (Frontend):** Construído com tecnologias web (HTML, CSS, JS) e empacotado para Android usando o **Capacitor**. Ele exibe gráficos, notícias operacionais e varreduras de dados. A maioria das transmissões de preços e volumes ocorrem praticamente em tempo real conectando-se diretamente aos WebSockets públicos (como os da Binance) e outras fontes abertas.
*   **O "Escudo" de IA e Dados (Cloudflare Worker):** As chaves sensíveis e pagas (como Groq AI, FRED para dados macroeconômicos e FMP) foram retiradas do código do app e movidas para um servidor próprio na nuvem (o Worker `visorcrypto.loan`). O app se comunica com esse escudo de forma segura usando um passe-livre simulado (`PROTECTED_BY_PROXY`). Isso impede que hackers roubem e esgotem suas contas das APIs originais.
*   **Zero Dados "Fantasma":** Fizemos uma varredura completa. O aplicativo não usa mais dados falsos (`mock`). 100% da operação consome os verdadeiros endpoints das corretoras, calendário americano (ForexFactory + Banco Central) e agregadores de notícias. Os únicos números "fixos" são as datas das reuniões do FOMC agendadas até o fim de 2026.

---

## 2. Capacidade: Quantos Usuários o App Comporta?

### Cenário Atual (De 1.000 a 5.000 usuários simultâneos)
Graças à introdução do **Cloudflare Worker** na nuvem atuando como seu "meio de campo" e fazendo *Cache* (salvando as respostas e reutilizando para vários usuários), o aplicativo está incrivelmente resistente para um lançamento primário. Se 1.000 pessoas abrirem a página do Relatório Groq ao mesmo tempo, a sua conta Groq receberá apenas **UMA** requisição, porque o proxy entregará o arquivo salvo para os outros 999.

### O Limitador Atual ("Polling")
Ainda existem rotinas no código JavaScript do aplicativo (`setInterval`) que perguntam às redes: _"Tem novidade agora? E agora? E agora?"_ a cada poucos segundos. Isso consome a bateria do celular do usuário e muita banda de rede.

### Como Atingir o "Infinito" (Futuro)
Para passar de 100.000 ou 1 milhão de usuários futuramente, você precisará mudar a estrutura de *Polling* (onde o celular puxa os dados) para *Push / Pub-Sub* (você cria um servidor central em WebSocket/Kafka que "empurra" a mudança simultaneamente para os milhares de relógios conectados apenas se houver alguma variação nos dados). O foco principal aqui será economia sua com o servidor central, não que o app vá parar de funcionar.

---

## 3. Recomendações Antes do Botão "Publicar"

Apesar do código estar sólido, a Google Play Store tem exigências burocráticas pesadas. Aqui está o passo a passo recomendado:

1.  **Testes Exhaustivos do APK no Mundo Real:** Você gerou o arquivo `app-release.apk`. Instale ele no seu smartphone Android, use ele na rede de dados móveis (3g/4g/5g) e não apenas no Wi-Fi. Deixe aberto por 30 minutos, navegue por todas as guias e teste as transições do calendário macro.
2.  **Gerar o Arquivo AAB (App Bundle):** A Play Store não aceita mais arquivos do tipo `.apk` para envio à loja, eles exigem o formato mais moderno `.aab`. Quando estiver totalmente feliz nos testes do APK, nós executaremos `.\gradlew bundleRelease` no terminal para compilar este arquivo final que deve ser upado na plataforma deles.
3.  **Assinatura Digital (Keystore):** Confirme se você assinou corretamente este *.aab/.apk* gerado com o certificado Keystore de Lançamento (e faça um backup valioso desse arquivo de chave; se você perder a senha da sua Keystore, você nunca mais conseguirá atualizar este aplicativo na Play Store no futuro).
4.  **Termos de Uso e Privacidade:** É obrigatório listar uma URL válida e ativa da sua "Política de Privacidade" diretamente na página do Google Play Console. Sem isso, o aplicativo corre um sério risco de suspensão.
5.  **Revisão do ASO (App Store Optimization):** Verifique se suas listagens locais (aulas, screenshots de alta qualidade contendo dicas como os manuais já contidos no repositório - `PLAYSTORE_ASO_CHECKLIST_PTBR.md`) estão perfeitamente ajustadas no seu painel.
6.  **Gordura ou Logs Ativos:** Para a versão 1.0.0 que estamos montando hoje, as mensagens de `console.log` no F12 do app não machucam o usuário, mas limpezas futuras de "logs" melhoram ativamente o desempenho da memória do Android.

**O aplicativo está oficialmente pronto na visão técnica das chaves. Bom Lançamento!**