        // ============================================
        // TRANSLATION SYSTEM - Google Translate API (via proxy)
        // ============================================
        const TRANSLATION_LS_KEY = 'vc4_translation_cache';
        
        // Load persisted translation cache on startup
        (function loadTranslationCache() {
            try {
                const saved = localStorage.getItem(TRANSLATION_LS_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    Object.assign(translationCache, parsed);
                }
            } catch(e) {}
        })();
        
        function persistTranslationCache() {
            try {
                // Keep only most recent 300 entries to avoid storage bloat
                const keys = Object.keys(translationCache);
                if (keys.length > 300) {
                    const toKeep = keys.slice(-300);
                    const trimmed = {};
                    toKeep.forEach(k => trimmed[k] = translationCache[k]);
                    localStorage.setItem(TRANSLATION_LS_KEY, JSON.stringify(trimmed));
                } else {
                    localStorage.setItem(TRANSLATION_LS_KEY, JSON.stringify(translationCache));
                }
            } catch(e) {}
        }
        
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
                        const translated = await translateText(news.title);
                        // Only set translatedTitle if it actually changed (was translated)
                        if (translated && translated !== news.title) {
                            news.translatedTitle = translated;
                        } else {
                            // Translation failed or returned same text - keep for retry
                            // but mark as attempted to show something
                            news.translatedTitle = translated || news.title;
                        }
                    } catch (e) {
                        news.translatedTitle = news.title;
                    }
                }));
            }
            // Persist translation cache after batch
            persistTranslationCache();
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
            // Persist after background batch
            if (translatedCount > 0) persistTranslationCache();
        }
        
