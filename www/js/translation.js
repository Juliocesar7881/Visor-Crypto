        // ============================================
        // TRANSLATION SYSTEM - Google Translate API (via proxy)
        // ============================================
        async function translateText(text) {
            if (!text || text.trim() === '') return text;
            
            // Se já está em cache, retornar
            const cacheKey = text.trim().toLowerCase();
            if (translationCache[cacheKey]) {
                return translationCache[cacheKey];
            }
            
            try {
                // Usar Google Translate via API pública - Português Brasileiro
                const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt-BR&dt=t&q=${encodeURIComponent(text)}`;
                const response = await fetchWithTimeout(url, {}, 3000); // Timeout de 3s
                const data = await response.json();
                
                if (data && data[0]) {
                    let translated = '';
                    for (let i = 0; i < data[0].length; i++) {
                        if (data[0][i][0]) {
                            translated += data[0][i][0];
                        }
                    }
                    if (translated && translated.trim() !== '') {
                        translationCache[cacheKey] = translated;
                        return translated;
                    }
                }
            } catch (e) {
            }
            
            // Fallback para MyMemory - Português Brasileiro
            try {
                const response = await fetchWithTimeout(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|pt-BR`, {}, 3000);
                const data = await response.json();
                
                if (data.responseStatus === 200 && data.responseData?.translatedText) {
                    let translated = data.responseData.translatedText;
                    if (!translated.includes('QUERY') && !translated.includes('MYMEMORY') && !translated.includes('PLEASE')) {
                        translationCache[cacheKey] = translated;
                        return translated;
                    }
                }
            } catch (e) {
            }
            
            return text; // Retorna original se tudo falhar
        }

        // Traduzir notícias ANTES de renderizar (bloqueia até terminar)
        // Isso garante que as notícias apareçam já em português
        async function translateNewsBeforeRender(count = 30) {
            // Filtrar notícias que precisam ser traduzidas
            const toTranslate = allNews.filter(n => !n.translatedTitle).slice(0, count);
            
            if (toTranslate.length === 0) {
                return;
            }
            
            // Traduzir em paralelo (mais rápido) - lotes de 5
            const batchSize = 5;
            for (let i = 0; i < toTranslate.length; i += batchSize) {
                const batch = toTranslate.slice(i, i + batchSize);
                await Promise.all(batch.map(async (news) => {
                    try {
                        news.translatedTitle = await translateText(news.title);
                    } catch (e) {
                        news.translatedTitle = news.title; // Manter original se falhar
                    }
                }));
            }
        }

        // Pré-traduzir notícias restantes (roda em background após renderizar)
        async function preTranslateNews() {
            let translatedCount = 0;
            const totalToTranslate = allNews.filter(n => !n.translatedTitle).length;
            
            if (totalToTranslate === 0) {
                return;
            }
            
            // Traduzir as que faltam
            for (const news of allNews) {
                if (!news.translatedTitle) {
                    try {
                        news.translatedTitle = await translateText(news.title);
                        translatedCount++;
                    } catch (e) {
                        news.translatedTitle = news.title;
                    }
                    await new Promise(r => setTimeout(r, 150));
                }
            }
        }
        