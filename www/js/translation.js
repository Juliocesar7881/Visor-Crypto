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
                const response = await fetchWithTimeout(url, {}, 5000);
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

        // Traduzir múltiplos textos em UMA chamada de API (bulk)
        // Reduz drasticamente o número de requests HTTP em internet lenta
        async function translateBulk(texts) {
            if (!texts || texts.length === 0) return [];

            const results = new Array(texts.length);
            const toTranslate = [];
            const toTranslateIndices = [];

            // Verificar cache primeiro
            for (let i = 0; i < texts.length; i++) {
                const cacheKey = (texts[i] || '').trim().toLowerCase();
                if (translationCache[cacheKey]) {
                    results[i] = translationCache[cacheKey];
                } else {
                    toTranslate.push(texts[i]);
                    toTranslateIndices.push(i);
                }
            }

            if (toTranslate.length === 0) return results;

            // Juntar títulos com \n e traduzir tudo em 1 request
            const joined = toTranslate.join('\n');

            try {
                const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt-BR&dt=t&q=${encodeURIComponent(joined)}`;
                const response = await fetchWithTimeout(url, {}, 12000);
                const data = await response.json();

                if (data && data[0]) {
                    let fullText = '';
                    for (let seg = 0; seg < data[0].length; seg++) {
                        if (data[0][seg][0]) fullText += data[0][seg][0];
                    }

                    const lines = fullText.split('\n');
                    for (let i = 0; i < toTranslateIndices.length; i++) {
                        const idx = toTranslateIndices[i];
                        const translated = (lines[i] || '').trim();
                        if (translated) {
                            results[idx] = translated;
                            const cacheKey = toTranslate[i].trim().toLowerCase();
                            translationCache[cacheKey] = translated;
                        } else {
                            results[idx] = toTranslate[i];
                        }
                    }
                }
            } catch (e) {
                // Fallback: preencher com originais
                for (let i = 0; i < toTranslateIndices.length; i++) {
                    if (!results[toTranslateIndices[i]]) {
                        results[toTranslateIndices[i]] = toTranslate[i];
                    }
                }
            }

            // Garantir que nenhum slot ficou vazio
            for (let i = 0; i < results.length; i++) {
                if (!results[i]) results[i] = texts[i];
            }

            return results;
        }

        // Traduzir notícias ANTES de renderizar (bloqueia até terminar)
        // Usa tradução em bulk: ~10 títulos por chamada HTTP (em vez de 1 por 1)
        async function translateNewsBeforeRender(count = 30) {
            const toTranslate = allNews.filter(n => !n.translatedTitle).slice(0, count);
            if (toTranslate.length === 0) return;

            // Chunks de 10 títulos — cada chunk = 1 HTTP request
            const CHUNK = 10;
            const chunks = [];
            for (let i = 0; i < toTranslate.length; i += CHUNK) {
                chunks.push(toTranslate.slice(i, i + CHUNK));
            }

            // Traduzir chunks em paralelo (30 títulos = 3 requests em vez de 30)
            await Promise.all(chunks.map(async (chunk) => {
                try {
                    const titles = chunk.map(n => n.title);
                    const translated = await translateBulk(titles);
                    for (let j = 0; j < chunk.length; j++) {
                        chunk[j].translatedTitle = translated[j] || chunk[j].title;
                    }
                } catch (e) {
                    chunk.forEach(n => { n.translatedTitle = n.title; });
                }
            }));

            persistTranslationCache();
        }

        // Pré-traduzir notícias restantes (roda em background após renderizar)
        async function preTranslateNews() {
            const untranslated = allNews.filter(n => !n.translatedTitle);
            if (untranslated.length === 0) return;

            const CHUNK = 10;
            let translatedCount = 0;
            for (let i = 0; i < untranslated.length; i += CHUNK) {
                const chunk = untranslated.slice(i, i + CHUNK);
                try {
                    const titles = chunk.map(n => n.title);
                    const translated = await translateBulk(titles);
                    for (let j = 0; j < chunk.length; j++) {
                        chunk[j].translatedTitle = translated[j] || chunk[j].title;
                        translatedCount++;
                    }
                } catch (e) {
                    chunk.forEach(n => { n.translatedTitle = n.title; });
                }
                // Pausa entre batches para não sobrecarregar
                if (i + CHUNK < untranslated.length) {
                    await new Promise(r => setTimeout(r, 300));
                }
            }
            if (translatedCount > 0) persistTranslationCache();
        }
        
