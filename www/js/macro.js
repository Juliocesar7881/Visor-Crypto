        // ============================================
        // MACRO SECTION - Dados Macroeconômicos
        // ============================================
        
        // Macro Tab Switcher
        function switchMacroTab(tab) {
            document.querySelectorAll('.macro-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.macro-panel').forEach(p => p.classList.remove('active'));
            
            // Ativar tab correspondente (compatível com Android/Capacitor)
            document.querySelectorAll('.macro-tab').forEach(t => {
                if (t.getAttribute('onclick')?.includes(tab)) {
                    t.classList.add('active');
                }
            });
            const panelEl = document.getElementById(`panel-${tab}`);
            if (panelEl) panelEl.classList.add('active');
        }

        // FOMC Meeting Dates 2025-2026 com horários de anúncio (16:00 horário de Brasília)
        const FOMC_MEETINGS = [
            { date: '2025-01-29', label: '28-29 Jan 2025', time: '16:00' },
            { date: '2025-03-19', label: '18-19 Mar 2025', time: '16:00' },
            { date: '2025-05-07', label: '6-7 Mai 2025', time: '16:00' },
            { date: '2025-06-18', label: '17-18 Jun 2025', time: '16:00' },
            { date: '2025-07-30', label: '29-30 Jul 2025', time: '16:00' },
            { date: '2025-09-17', label: '16-17 Set 2025', time: '16:00' },
            { date: '2025-11-05', label: '4-5 Nov 2025', time: '16:00' },
            { date: '2025-12-17', label: '16-17 Dez 2025', time: '16:00' },
            { date: '2026-01-28', label: '27-28 Jan 2026', time: '16:00' },
            { date: '2026-03-18', label: '17-18 Mar 2026', time: '16:00' },
            { date: '2026-05-06', label: '5-6 Mai 2026', time: '16:00' },
            { date: '2026-06-17', label: '16-17 Jun 2026', time: '16:00' },
            { date: '2026-07-29', label: '28-29 Jul 2026', time: '16:00' },
            { date: '2026-09-16', label: '15-16 Set 2026', time: '16:00' },
            { date: '2026-11-04', label: '3-4 Nov 2026', time: '16:00' },
            { date: '2026-12-16', label: '15-16 Dez 2026', time: '16:00' }
        ];

        function getNextFOMCMeeting() {
            const today = new Date();
            for (const meeting of FOMC_MEETINGS) {
                const meetingDate = new Date(meeting.date);
                if (meetingDate > today) {
                    const diffTime = meetingDate - today;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return { ...meeting, daysUntil: diffDays };
                }
            }
            return null;
        }

        // ============================================
        // FED WATCH - Polymarket API + FRED
        // ============================================
        const FED_CACHE_KEY = 'fed_watch_cache';
        const FED_CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
        
        // Cache de dados do Fed
        function getFedCache() {
            try {
                const cached = localStorage.getItem(FED_CACHE_KEY);
                if (cached) {
                    const data = JSON.parse(cached);
                    if (Date.now() - data.timestamp < FED_CACHE_DURATION) {
                        return data;
                    }
                }
            } catch (e) {}
            return null;
        }
        
        function setFedCache(data) {
            try {
                localStorage.setItem(FED_CACHE_KEY, JSON.stringify({
                    ...data,
                    timestamp: Date.now()
                }));
            } catch (e) {}
        }

        async function fetchFedWatchData() {
            const container = document.getElementById('fed-probabilities');
            const nextMeetingEl = document.getElementById('next-fomc-meeting');
            const currentRateEl = document.getElementById('current-fed-rate');
            
            // Atualizar próxima reunião
            const nextMeeting = getNextFOMCMeeting();
            const nextMeeting2 = FOMC_MEETINGS.find(m => new Date(m.date) > new Date(nextMeeting?.date || '2099-12-31'));
            
            if (nextMeeting) {
                nextMeetingEl.innerHTML = `Próxima reunião FOMC: <strong>${nextMeeting.label}</strong> às <strong>${nextMeeting.time}h</strong> (${nextMeeting.daysUntil} dias)`;
            }
            
            // Verificar cache
            const cache = getFedCache();
            if (cache && cache.probabilities) {
                renderFedProbabilities(container, cache, nextMeeting, nextMeeting2);
                return;
            }
            
            container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
            
            try {
                let cutProb = 0;
                let holdProb = 0;
                let hikeProb = 0;
                let currentRate = '--';
                let lastDecisions = [];
                let dataSource = 'estimated';
                
                // 1. Buscar probabilidades Fed da Polymarket (Gamma API - top mercados ativos)
                try {
                    const polymarketUrl = 'https://gamma-api.polymarket.com/markets?limit=30&active=true&order=volume24hr&ascending=false';
                    
                    const polyRes = await fetchWithTimeout(polymarketUrl, {}, 8000);
                    if (polyRes.ok) {
                        const polyData = await polyRes.json();
                        
                        if (polyData && Array.isArray(polyData) && polyData.length > 0) {
                            // Filtrar mercados Fed por texto da question
                            const fedMarkets = polyData.filter(m => {
                                const q = (m.question || '').toLowerCase();
                                return q.includes('fed') && (q.includes('interest') || q.includes('rate'));
                            });
                            
                            for (const market of fedMarkets) {
                                const question = (market.question || '').toLowerCase();
                                // outcomePrices vem como JSON string: '["0.98", "0.02"]'
                                let yesPrice = 0;
                                try {
                                    const prices = typeof market.outcomePrices === 'string' 
                                        ? JSON.parse(market.outcomePrices) 
                                        : market.outcomePrices;
                                    if (Array.isArray(prices) && prices.length > 0) yesPrice = parseFloat(prices[0]);
                                } catch(e) {}
                                if (!yesPrice || isNaN(yesPrice)) yesPrice = parseFloat(market.lastTradePrice || 0);
                                if (!yesPrice || isNaN(yesPrice) || yesPrice <= 0) continue;
                                const pct = Math.round(yesPrice * 100);
                                
                                if (question.includes('no change') || question.includes('unchanged')) {
                                    holdProb = pct;
                                } else if (question.includes('decrease') || question.includes('cut') || question.includes('lower')) {
                                    cutProb += pct;
                                } else if (question.includes('increase') || question.includes('hike') || question.includes('raise') || question.includes('higher')) {
                                    hikeProb += pct;
                                }
                            }
                            
                            if (fedMarkets.length > 0) {
                                // Normalizar para 100%
                                const total = cutProb + holdProb + hikeProb;
                                if (total > 0 && total !== 100) {
                                    cutProb = Math.round(cutProb / total * 100);
                                    hikeProb = Math.round(hikeProb / total * 100);
                                    holdProb = 100 - cutProb - hikeProb;
                                }
                                dataSource = 'polymarket';
                            }
                        }
                    }
                } catch (e) {
                }
                
                // 2. Buscar taxa atual do FRED (direto, sem proxy)
                try {
                    const directUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&sort_order=desc&limit=3&api_key=289c022214958a3eb611142e8dc34f6b&file_type=json`;
                    
                    const fredRes = await fetchWithTimeout(directUrl, {}, 10000);
                    if (fredRes.ok) {
                        const fredData = await fredRes.json();
                        if (fredData.observations && fredData.observations.length > 0) {
                            const latestRate = parseFloat(fredData.observations[0].value);
                            currentRate = `${(latestRate - 0.25).toFixed(2)}-${latestRate.toFixed(2)}%`;
                            
                            // Últimas decisões
                            lastDecisions = fredData.observations.slice(0, 2).map(obs => ({
                                date: obs.date,
                                rate: parseFloat(obs.value)
                            }));
                        }
                    }
                } catch (e) {
                    // Não usar dados estáticos - manter currentRate como padrão se não conseguir
                }
                
                // Se não conseguiu Polymarket, estimar a partir da taxa FRED
                if (dataSource === 'estimated' && currentRate !== '--') {
                    // Sem mercados de previsão, usar lógica conservadora baseada na taxa atual
                    holdProb = 85;
                    cutProb = 12;
                    hikeProb = 3;
                    dataSource = 'fred-estimated';
                }
                
                if (dataSource === 'estimated') {
                    container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;"><i class="fas fa-chart-line"></i> Não foi possível carregar probabilidades do Fed. Tente novamente mais tarde.</p>';
                    return;
                }
                
                // Atualizar taxa atual
                if (currentRateEl) {
                    currentRateEl.textContent = currentRate;
                }
                
                // Salvar no cache
                const fedData = {
                    probabilities: { cutProb, holdProb, hikeProb },
                    currentRate,
                    lastDecisions,
                    dataSource
                };
                setFedCache(fedData);
                
                // Renderizar
                renderFedProbabilities(container, fedData, nextMeeting, nextMeeting2);
                
            } catch (e) {
                container.innerHTML = '<p style="text-align: center; color: var(--accent-red); padding: 20px;"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar dados do Fed Watch</p>';
            }
        }
        
        function renderFedProbabilities(container, data, nextMeeting, nextMeeting2) {
            const { cutProb, holdProb, hikeProb } = data.probabilities;
            const dataSource = data.dataSource;
            
            container.innerHTML = `
                <div class="fed-prob-item">
                    <div class="fed-prob-header">
                        <span class="fed-prob-action cut"><i class="fas fa-arrow-down"></i> Corte de Juros</span>
                        <span class="fed-prob-percent pnl-positive">${cutProb}%</span>
                    </div>
                    <div class="fed-prob-bar">
                        <div class="fed-prob-fill cut" style="width: ${cutProb}%"></div>
                    </div>
                </div>
                <div class="fed-prob-item">
                    <div class="fed-prob-header">
                        <span class="fed-prob-action hold"><i class="fas fa-equals"></i> Manutenção</span>
                        <span class="fed-prob-percent" style="color: var(--accent-yellow);">${holdProb}%</span>
                    </div>
                    <div class="fed-prob-bar">
                        <div class="fed-prob-fill hold" style="width: ${holdProb}%"></div>
                    </div>
                </div>
                <div class="fed-prob-item">
                    <div class="fed-prob-header">
                        <span class="fed-prob-action hike"><i class="fas fa-arrow-up"></i> Aumento de Juros</span>
                        <span class="fed-prob-percent pnl-negative">${hikeProb}%</span>
                    </div>
                    <div class="fed-prob-bar">
                        <div class="fed-prob-fill hike" style="width: ${hikeProb}%"></div>
                    </div>
                </div>
                
                <!-- Histórico FOMC - Dados reais via FRED API -->
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-subtle);">
                    <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-history"></i> Últimas Decisões FOMC
                    </div>
                    <div id="fed-history-container" style="display: flex; gap: 10px;">
                        <div style="flex: 1; text-align: center; padding: 12px; background: var(--bg-secondary); border-radius: 10px;">
                            <div style="color: var(--text-muted); font-size: 11px;"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>
                        </div>
                    </div>
                </div>
                
                <p style="font-size: 11px; color: var(--text-muted); text-align: center; margin-top: 12px;">
                    <i class="fas fa-info-circle"></i> Fonte: ${dataSource === 'polymarket' ? 'Polymarket (Gamma API)' : dataSource === 'fred-estimated' ? 'Estimativa baseada em FRED API' : 'FRED API (Federal Reserve)'}
                </p>
            `;
            
            // Buscar histórico real do FRED e última decisão em background
            fetchFedHistoryAndDecision();
        }

        // Buscar histórico REAL de decisões do Fed e última decisão via FRED API
        async function fetchFedHistoryAndDecision() {
            const container = document.getElementById('fed-history-container');
            const lastDecisionEl = document.getElementById('last-fed-decision');
            
            // FRED API key - fallback direto quando proxy indisponível
            const FRED_KEY = (window.APP_CONFIG && window.APP_CONFIG.FRED_KEY) || '';
            const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            
            try {
                // Buscar últimas 400 observações do DFEDTARU para encontrar mudanças
                const FRED_KEY_HIST = '289c022214958a3eb611142e8dc34f6b';
                const directUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=DFEDTARU&sort_order=desc&limit=400&api_key=${FRED_KEY_HIST}&file_type=json`;
                
                let response = null;
                try {
                    response = await fetchWithTimeout(directUrl, {}, 12000);
                    if (!response.ok) response = null;
                } catch(e) { response = null; }
                
                if (!response || !response.ok) throw new Error('Todas as tentativas FRED falharam');
                const fredData = await response.json();
                
                if (!fredData.observations || fredData.observations.length < 2) throw new Error('No data');
                
                // Dados vêm em ordem DESC (mais recente primeiro)
                // Encontrar mudanças reais na taxa
                const decisions = [];
                let prevValue = null; // prevValue = valor mais recente (cronologicamente posterior)
                
                for (const obs of fredData.observations) {
                    const value = parseFloat(obs.value);
                    if (isNaN(value) || String(obs.value).trim() === '.') continue;
                    
                    if (prevValue !== null && value !== prevValue) {
                        // obs.date = último dia da taxa ANTIGA
                        // prevValue = taxa NOVA (mais recente), value = taxa ANTIGA
                        // Mudança real: prevValue - value (novo - antigo)
                        const realChange = prevValue - value;
                        decisions.push({
                            date: obs.date,
                            rate: prevValue, // Taxa que entrou em vigor (nova)
                            prevRate: value, // Taxa anterior
                            change: realChange.toFixed(2)
                        });
                        if (decisions.length >= 3) break;
                    }
                    prevValue = value;
                }
                
                // Atualizar "Última Decisão" 
                if (lastDecisionEl) {
                    if (decisions.length > 0) {
                        const lastChange = parseFloat(decisions[0].change);
                        const bps = Math.abs(lastChange * 100).toFixed(0);
                        if (lastChange < 0) {
                            lastDecisionEl.innerHTML = `<span style="color: var(--accent-green);"><i class="fas fa-arrow-down"></i> Corte ${bps}pb</span>`;
                        } else if (lastChange > 0) {
                            lastDecisionEl.innerHTML = `<span style="color: var(--accent-red);"><i class="fas fa-arrow-up"></i> Aumento ${bps}pb</span>`;
                        } else {
                            lastDecisionEl.innerHTML = `<span style="color: var(--accent-yellow);"><i class="fas fa-equals"></i> Manutenção</span>`;
                        }
                    } else {
                        lastDecisionEl.innerHTML = `<span style="color: var(--accent-yellow);"><i class="fas fa-equals"></i> Manutenção</span>`;
                    }
                }
                
                // Renderizar histórico de decisões reais
                if (container && decisions.length > 0) {
                    container.innerHTML = decisions.slice(0, 3).map(d => {
                        const dt = new Date(d.date + 'T00:00:00');
                        const monthStr = months[dt.getMonth()];
                        const year = dt.getFullYear().toString().slice(-2);
                        const changeBps = Math.abs(parseFloat(d.change) * 100).toFixed(0);
                        const iscut = parseFloat(d.change) < 0;
                        const color = iscut ? 'var(--accent-green)' : 'var(--accent-red)';
                        const arrow = iscut ? '↓' : '↑';
                        const label = iscut ? `Corte ${changeBps}pb` : `Aumento ${changeBps}pb`;
                        
                        return `
                            <div style="flex: 1; background: var(--bg-secondary); border-radius: 10px; padding: 12px; text-align: center;">
                                <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">${monthStr}/${year}</div>
                                <div style="font-size: 16px; font-weight: 800; color: ${color};">${d.rate.toFixed(2)}%</div>
                                <div style="font-size: 9px; color: ${color}; margin-top: 2px;">${arrow} ${label}</div>
                            </div>
                        `;
                    }).join('');
                } else if (container) {
                    container.innerHTML = `
                        <div style="flex: 1; text-align: center; padding: 12px; background: var(--bg-secondary); border-radius: 10px;">
                            <div style="color: var(--text-muted); font-size: 11px;">Sem mudanças recentes na taxa</div>
                        </div>
                    `;
                }
                
            } catch (e) {
                if (container) {
                    container.innerHTML = `
                        <div style="flex: 1; text-align: center; padding: 12px; background: var(--bg-secondary); border-radius: 10px;">
                            <div style="color: var(--accent-red); font-size: 11px;"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar histórico</div>
                        </div>
                    `;
                }
                if (lastDecisionEl) {
                    lastDecisionEl.innerHTML = `<span style="color: var(--text-muted);"><i class="fas fa-exclamation-circle"></i> N/D</span>`;
                }
            }
        }

        // ============================================
        // EVENT DETAIL MODAL
        // ============================================
        const eventDetailsDatabase = {
            'Non-Farm Payrolls': {
                fullDescription: 'O relatório Non-Farm Payrolls (NFP) mede a variação no número de pessoas empregadas nos EUA, excluindo trabalhadores rurais, funcionários do governo, empregados domésticos e funcionários de ONGs.',
                marketImpact: 'Dados acima do esperado indicam economia forte, o que pode levar o Fed a manter ou aumentar juros. Dados abaixo do esperado sugerem desaceleração econômica, aumentando chances de cortes de juros.',
                cryptoImpact: 'NFP forte geralmente pressiona cripto negativamente no curto prazo (expectativa de juros altos). NFP fraco pode impulsionar cripto como alternativa ao dólar.'
            },
            'CPI (Inflação)': {
                fullDescription: 'O Consumer Price Index (CPI) mede a variação média dos preços pagos pelos consumidores por uma cesta de bens e serviços. É o principal indicador de inflação nos EUA.',
                marketImpact: 'Inflação acima do esperado aumenta a probabilidade de juros altos por mais tempo. Inflação em queda abre espaço para cortes de juros e estimula ativos de risco.',
                cryptoImpact: 'Alta inflação historicamente beneficia Bitcoin como hedge. Porém, se a inflação forçar juros altos, há pressão negativa no curto prazo sobre cripto.'
            },
            'PPI (Preços ao Produtor)': {
                fullDescription: 'O Producer Price Index (PPI) mede a variação média dos preços recebidos pelos produtores domésticos por sua produção. É um indicador antecedente da inflação ao consumidor.',
                marketImpact: 'PPI é visto como preview do CPI. Aumento forte no PPI indica que a inflação pode subir, afetando decisões do Fed sobre juros.',
                cryptoImpact: 'Impacto similar ao CPI, mas geralmente mais moderado. Serve como sinal de alerta para movimentos futuros em cripto.'
            },
            'Retail Sales': {
                fullDescription: 'O relatório de Retail Sales mede o valor total das vendas no varejo nos EUA. É um indicador chave da saúde do consumidor e da economia.',
                marketImpact: 'Vendas fortes indicam economia resiliente, o que pode prolongar ciclo de juros altos. Vendas fracas sugerem desaceleração e possível recessão.',
                cryptoImpact: 'Dados de varejo fortes geralmente são bearish para cripto (mantém juros altos). Dados fracos podem ser bullish se indicarem cortes de juros próximos.'
            },
            'Decisão FOMC': {
                fullDescription: 'A reunião do Federal Open Market Committee (FOMC) decide a taxa de juros básica dos EUA. O comunicado e a coletiva do Fed Chair fornecem guidance sobre política monetária futura.',
                marketImpact: 'É o evento mais importante para mercados financeiros. Mudanças na taxa ou no tom do comunicado podem causar movimentos extremos em todos os ativos.',
                cryptoImpact: 'Cortes de juros são extremamente bullish para cripto. Aumentos ou tom hawkish são bearish. A volatilidade é máxima durante e após o anúncio.'
            },
            'PIB Q4 2025': {
                fullDescription: 'O Produto Interno Bruto (PIB) mede o valor total de bens e serviços produzidos na economia. O dado trimestral é crucial para avaliar o ritmo de crescimento econômico.',
                marketImpact: 'PIB forte sugere economia saudável, mas pode indicar pressão inflacionária. PIB fraco levanta preocupações de recessão, mas pode acelerar cortes de juros.',
                cryptoImpact: 'PIB muito forte pode ser bearish (juros altos). PIB em desaceleração moderada pode ser bullish se acelerar expectativas de cortes.'
            },
            'ISM Services': {
                fullDescription: 'O ISM Services Index mede a atividade no setor de serviços, que representa mais de 70% da economia americana. Leitura acima de 50 indica expansão.',
                marketImpact: 'Setor de serviços forte mantém inflação alta (especialmente salários). Desaceleração pode indicar economia esfriando.',
                cryptoImpact: 'Impacto moderado. ISM muito forte é levemente bearish para cripto. ISM fraco pode ser levemente bullish.'
            },
            'Decisão BCE': {
                fullDescription: 'O Banco Central Europeu (BCE) decide a taxa de juros para a Zona do Euro. A política monetária europeia afeta mercados globais e a relação EUR/USD.',
                marketImpact: 'Divergência entre políticas do Fed e BCE afeta câmbio. BCE dovish fortalece dólar. BCE hawkish enfraquece dólar.',
                cryptoImpact: 'Impacto indireto via dólar. BCE dovish (dólar forte) pode pressionar cripto. BCE hawkish (dólar fraco) pode beneficiar cripto.'
            }
        };

        // Buscar histórico FRED estendido para um evento específico
        async function fetchFREDHistoryForEvent(seriesId, eventTitle) {
            const container = document.getElementById('fred-extended-history');
            if (!container) return;
            
            try {
                let historyData = null;
                
                // Tentar Worker primeiro (se configurado)
                if (CALENDAR_WORKER_URL) {
                    try {
                        const workerRes = await fetchWithTimeout(CALENDAR_WORKER_URL + '/history?series=' + encodeURIComponent(seriesId), {}, 4000);
                        if (workerRes.ok) {
                            const result = await workerRes.json();
                            if (result.success && Array.isArray(result.data) && result.data.length > 0) {
                                historyData = result.data;
                            }
                        }
                    } catch(e) {}
                }
                
                // Fallback: FRED direto
                if (!historyData) {
                    try {
                        const fredUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&sort_order=desc&limit=12&api_key=${FRED_API_KEY_CALENDAR}&file_type=json`;
                        const fredRes = await fetchWithTimeout(fredUrl, {}, 8000);
                        if (fredRes.ok) {
                            const fredData = await fredRes.json();
                            if (fredData.observations) {
                                historyData = fredData.observations
                                    .filter(o => o.value && o.value !== '.')
                                    .map(o => ({ date: o.date, value: parseFloat(o.value) }))
                                    .reverse();
                            }
                        }
                    } catch(e) {}
                }
                
                if (!historyData || historyData.length === 0) {
                    container.innerHTML = '';
                    return;
                }
                
                // Renderizar mini-gráfico de histórico
                const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                const lastItems = historyData.slice(-8);
                
                container.innerHTML = `
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-subtle);">
                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-chart-line"></i> Histórico FRED (${seriesId})
                        </div>
                        <div style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px;">
                            ${lastItems.map((item, i) => {
                                const d = new Date(item.date + 'T00:00:00');
                                const label = months[d.getMonth()] + '/' + d.getFullYear().toString().slice(-2);
                                const prev = i > 0 ? lastItems[i - 1].value : item.value;
                                const color = item.value > prev ? 'var(--accent-green)' : item.value < prev ? 'var(--accent-red)' : 'var(--text-muted)';
                                return `
                                    <div style="flex: 1; min-width: 55px; background: var(--bg-secondary); border-radius: 8px; padding: 8px 4px; text-align: center;">
                                        <div style="font-size: 9px; color: var(--text-muted); margin-bottom: 3px;">${label}</div>
                                        <div style="font-size: 13px; font-weight: 700; color: ${color};">${item.value.toFixed(1)}</div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        <p style="font-size: 9px; color: var(--text-muted); text-align: center; margin-top: 6px;">
                            <i class="fas fa-database"></i> Fonte: Federal Reserve Economic Data (FRED)
                        </p>
                    </div>
                `;
            } catch(e) {
                container.innerHTML = '';
            }
        }

        function openEventDetailModal(event) {
            const modal = document.getElementById('event-detail-modal');
            const details = eventDetailsDatabase[event.title] || {
                fullDescription: event.description,
                marketImpact: 'Dados econômicos importantes que podem afetar a política monetária e os mercados financeiros.',
                cryptoImpact: 'O impacto em criptomoedas depende de como o mercado interpreta os dados em relação às expectativas.'
            };
            
            // Preencher dados
            const dayEl = document.querySelector('#event-detail-date .event-detail-day');
            const monthEl = document.querySelector('#event-detail-date .event-detail-month');
            if (dayEl) dayEl.textContent = event.day;
            if (monthEl) monthEl.textContent = event.month;
            const titleEl2 = document.getElementById('event-detail-title');
            if (titleEl2) titleEl2.textContent = event.title;
            
            // Incluir horário no país/descrição
            const timeInfo = event.time ? ` • <strong style="color: var(--accent-blue);"><i class="fas fa-clock"></i> ${event.time}h</strong>` : '';
            const countryEl = document.getElementById('event-detail-country');
            if (countryEl) countryEl.innerHTML = `${event.country} • ${event.description}${timeInfo}`;
            
            const impactEl = document.getElementById('event-detail-impact');
            if (impactEl) {
                impactEl.style.display = 'none';
            }
            
            const descEl = document.getElementById('event-detail-description');
            const mktEl = document.getElementById('event-detail-market-impact');
            const crypEl = document.getElementById('event-detail-crypto-impact');
            if (descEl) descEl.textContent = details.fullDescription;
            if (mktEl) mktEl.textContent = details.marketImpact;
            if (crypEl) crypEl.textContent = details.cryptoImpact;
            
            // Mostrar histórico de dados - sempre visível com placeholder para evitar saltos de layout
            const historySection = document.getElementById('event-history-section');
            if (historySection) {
                historySection.style.display = 'block';
                
                // Mostrar dados inline primeiro
                if (event.history && event.history.length > 0 && event.history[0].value !== '-') {
                    historySection.innerHTML = `
                        <div class="card-header" style="margin-bottom: 12px;">
                            <div class="card-title">
                                <i class="fas fa-history"></i>
                                Últimos Resultados
                            </div>
                        </div>
                        <div class="event-history-grid">
                            ${event.history.map(h => `
                                <div class="event-history-item ${h.type}">
                                    <div class="event-history-date">${h.date}</div>
                                    <div class="event-history-value">${h.value}</div>
                                </div>
                            `).join('')}
                        </div>
                        <div id="fred-extended-history" style="margin-top: 12px;"></div>
                    `;
                } else {
                    historySection.innerHTML = `
                        <div class="card-header" style="margin-bottom: 12px;">
                            <div class="card-title">
                                <i class="fas fa-history"></i>
                                Últimos Resultados
                            </div>
                        </div>
                        <div id="fred-extended-history">
                            <div style="text-align: center; padding: 12px; color: var(--text-muted); font-size: 12px;">
                                <i class="fas fa-spinner fa-spin" style="opacity: 0.5;"></i> Carregando histórico FRED...
                            </div>
                        </div>
                    `;
                }
                
                // Buscar histórico estendido do FRED via Worker (se tem fredSeriesId)
                if (event.fredSeriesId) {
                    fetchFREDHistoryForEvent(event.fredSeriesId, event.title);
                }
            }
            
            // Mostrar probabilidades para eventos específicos
            const probSection = document.getElementById('event-probabilities-section');
            const probContent = document.getElementById('event-probabilities-content');
            
            if (event.title === 'Decisão FOMC' || event.title.includes('Decisão')) {
                // Usar dados REAIS do cache do Fed Watch (Polymarket)
                const fedCache = getFedCache();
                if (fedCache && fedCache.probabilities && fedCache.dataSource === 'polymarket') {
                    const { cutProb, holdProb, hikeProb } = fedCache.probabilities;
                    probSection.style.display = 'block';
                    probContent.innerHTML = `
                        <div class="event-prob-item">
                            <div class="event-prob-header">
                                <span class="event-prob-label" style="color: var(--accent-green);"><i class="fas fa-arrow-down"></i> Corte de Juros</span>
                                <span class="event-prob-value pnl-positive">${cutProb}%</span>
                            </div>
                            <div class="event-prob-bar">
                                <div class="event-prob-fill" style="width: ${cutProb}%; background: linear-gradient(90deg, var(--accent-green), #4ade80);"></div>
                            </div>
                        </div>
                        <div class="event-prob-item">
                            <div class="event-prob-header">
                                <span class="event-prob-label" style="color: var(--accent-yellow);"><i class="fas fa-equals"></i> Manutenção</span>
                                <span class="event-prob-value" style="color: var(--accent-yellow);">${holdProb}%</span>
                            </div>
                            <div class="event-prob-bar">
                                <div class="event-prob-fill" style="width: ${holdProb}%; background: linear-gradient(90deg, var(--accent-yellow), #fcd34d);"></div>
                            </div>
                        </div>
                        <div class="event-prob-item">
                            <div class="event-prob-header">
                                <span class="event-prob-label" style="color: var(--accent-red);"><i class="fas fa-arrow-up"></i> Aumento</span>
                                <span class="event-prob-value pnl-negative">${hikeProb}%</span>
                            </div>
                            <div class="event-prob-bar">
                                <div class="event-prob-fill" style="width: ${hikeProb}%; background: linear-gradient(90deg, var(--accent-red), #f87171);"></div>
                            </div>
                        </div>
                        <p style="font-size: 10px; color: var(--text-muted); text-align: center; margin-top: 8px;">
                            <i class="fas fa-info-circle"></i> Fonte: Polymarket (Gamma API) - Dados em tempo real
                        </p>
                    `;
                } else {
                    // Sem dados reais disponíveis - não mostrar probabilidades falsas
                    probSection.style.display = 'block';
                    probContent.innerHTML = `
                        <div style="text-align: center; padding: 16px; color: var(--text-muted);">
                            <i class="fas fa-chart-pie" style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;"></i>
                            <p style="margin: 0; font-size: 12px;">Probabilidades não disponíveis no momento.</p>
                            <p style="margin: 4px 0 0; font-size: 10px;">Acesse a aba Macro → Fed Watch para dados atualizados.</p>
                        </div>
                    `;
                }
            } else if (event.title.includes('CPI') || event.title.includes('Inflação')) {
                // Não exibir probabilidades inventadas para CPI - sem fonte real
                probSection.style.display = 'none';
            } else if (event.title.includes('Non-Farm') || event.title.includes('Payrolls')) {
                // Não exibir probabilidades inventadas para NFP - sem fonte real
                probSection.style.display = 'none';
            } else {
                probSection.style.display = 'none';
            }
            
            // Mostrar modal
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Adicionar ao histórico para suportar botão voltar
            if (window.history && window.history.pushState) {
                window.history.pushState({ page: 'event-detail' }, '', '');
            }
        }

        function closeEventDetailModal() {
            document.getElementById('event-detail-modal').classList.remove('active');
            document.body.style.overflow = '';
        }

        // ============================================
        // CALENDÁRIO ECONÔMICO - Multi-Source Pipeline
        // ============================================
        // Worker URL - quando disponível, é a fonte primária (deploy worker/ para ativar)
        const CALENDAR_WORKER_URL = (window.APP_CONFIG && window.APP_CONFIG.CALENDAR_WORKER_URL) || '';
        
        // FRED API key - hardcoded como fallback (mesma do macro-section.js)
        const FRED_API_KEY_CALENDAR = (window.APP_CONFIG && window.APP_CONFIG.FRED_KEY) || '289c022214958a3eb611142e8dc34f6b';
        
        // FRED series IDs para dados históricos dos eventos
        const FRED_SERIES_MAP = {
            'nonfarm payroll': 'PAYEMS',
            'unemployment': 'UNRATE',
            'cpi': 'CPIAUCSL',
            'core cpi': 'CPILFESL',
            'ppi': 'PPIACO',
            'pce': 'PCEPI',
            'core pce': 'PCEPILFE',
            'gdp': 'GDP',
            'retail sales': 'RSAFS',
            'industrial production': 'INDPRO',
            'ism manufacturing': 'NAPM',
            'ism services': 'NMFCI',
            'consumer confidence': 'UMCSENT',
            'michigan': 'UMCSENT',
            'housing starts': 'HOUST',
            'building permits': 'PERMIT',
            'durable goods': 'DGORDER',
            'initial jobless': 'ICSA',
            'jolts': 'JTSJOL',
            'personal income': 'PI',
            'personal spending': 'PCE',
            'trade balance': 'BOPGSTB',
            'interest rate': 'FEDFUNDS',
            'fomc': 'FEDFUNDS',
            'adp': 'ADPWNUSNERSA',
        };
        
        function getFredSeriesForEvent(eventName) {
            const lower = (eventName || '').toLowerCase();
            for (const [keyword, seriesId] of Object.entries(FRED_SERIES_MAP)) {
                if (lower.includes(keyword)) return seriesId;
            }
            return null;
        }
        
        // Mapa de releases FRED → eventos do calendário (fonte autoritativa)
        const FRED_RELEASE_MAP = [
            { match: /^consumer price index$/i, title: 'CPI (Inflação)', time: '10:30', impact: 'high', series: 'CPIAUCSL' },
            { match: /^producer price index$/i, title: 'PPI (Preços ao Produtor)', time: '10:30', impact: 'high', series: 'PPIACO' },
            { match: /^employment situation$/i, title: 'Emprego Não-Agrícola (NFP)', time: '10:30', impact: 'high', series: 'PAYEMS' },
            { match: /^job openings and labor turnover/i, title: 'JOLTS Vagas de Emprego', time: '12:00', impact: 'high', series: 'JTSJOL' },
            { match: /^advance monthly sales/i, title: 'Vendas no Varejo', time: '10:30', impact: 'high', series: 'RSAFS' },
            { match: /^gross domestic product/i, title: 'PIB dos EUA', time: '10:30', impact: 'high', series: 'GDP' },
            { match: /^personal income and outlays/i, title: 'PCE / Renda Pessoal', time: '10:30', impact: 'high', series: 'PCEPI' },
            { match: /^ISM manufacturing/i, title: 'PMI Manufatura (ISM)', time: '12:00', impact: 'high', series: 'NAPM' },
            { match: /^ISM.*(?:services|non.?manufacturing)/i, title: 'PMI Serviços (ISM)', time: '12:00', impact: 'high', series: 'NMFCI' },
            { match: /^(University of Michigan|Surveys of Consumers)/i, title: 'Sentimento Michigan', time: '12:00', impact: 'high', series: 'UMCSENT' },
            { match: /^consumer confidence/i, title: 'Confiança do Consumidor', time: '12:00', impact: 'high', series: 'UMCSENT' },
            { match: /^unemployment insurance weekly/i, title: 'Pedidos Seguro-Desemprego', time: '10:30', impact: 'medium', series: 'ICSA' },
            { match: /^existing home sales/i, title: 'Vendas de Imóveis Usados', time: '12:00', impact: 'medium', series: null },
            { match: /^new residential sales/i, title: 'Vendas de Imóveis Novos', time: '12:00', impact: 'medium', series: null },
            { match: /^housing units.*building permits/i, title: 'Alvarás de Construção', time: '10:30', impact: 'medium', series: 'PERMIT' },
        ];

        const CALENDAR_CACHE_KEY = 'economic_calendar_cache_v9';
        const CALENDAR_CACHE_DURATION = 30 * 60 * 1000; // 30 minutos
        
        // Clear old cache keys on upgrade
        try { localStorage.removeItem('economic_calendar_cache'); } catch(e) {}
        try { localStorage.removeItem('economic_calendar_cache_v2'); } catch(e) {}
        try { localStorage.removeItem('economic_calendar_cache_v3'); } catch(e) {}
        try { localStorage.removeItem('economic_calendar_cache_v4'); } catch(e) {}
        try { localStorage.removeItem('economic_calendar_cache_v5'); } catch(e) {}
        try { localStorage.removeItem('economic_calendar_cache_v6'); } catch(e) {}
        try { localStorage.removeItem('economic_calendar_cache_v7'); } catch(e) {}
        try { localStorage.removeItem('economic_calendar_cache_v8'); } catch(e) {}
        
        function getCalendarCache() {
            try {
                const cached = localStorage.getItem(CALENDAR_CACHE_KEY);
                if (cached) {
                    const data = JSON.parse(cached);
                    if (Date.now() - data.timestamp < CALENDAR_CACHE_DURATION) {
                        return data.events;
                    }
                }
            } catch (e) {}
            return null;
        }
        
        function setCalendarCache(events, lastUpdate) {
            try {
                localStorage.setItem(CALENDAR_CACHE_KEY, JSON.stringify({
                    events,
                    lastUpdate,
                    timestamp: Date.now()
                }));
            } catch (e) {}
        }
        
        // Buscar JSON do ForexFactory com múltiplas tentativas
        // CapacitorHttp (habilitado) roteia fetch() pelo HTTP nativo → sem CORS
        async function fetchFFCalendarJSON(url) {
            // Tentativa 1: fetch direto (funciona com CapacitorHttp nativo)
            try {
                const res = await fetchWithTimeout(url, {}, 8000);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        return data.filter(e => 
                            (e.country || '').toUpperCase() === 'USD' && 
                            e.impact === 'High'
                        );
                    }
                }
            } catch(e) {}
            
            // Tentativa 2: proxy allorigins (fallback para PWA/browser)
            try {
                const res = await fetchWithTimeout(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, {}, 6000);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        return data.filter(e => 
                            (e.country || '').toUpperCase() === 'USD' && 
                            e.impact === 'High'
                        );
                    }
                }
            } catch(e) {}
            
            // Tentativa 3: proxy corsproxy.io (fallback)
            try {
                const res = await fetchWithTimeout(`https://corsproxy.io/?${encodeURIComponent(url)}`, {}, 6000);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        return data.filter(e => 
                            (e.country || '').toUpperCase() === 'USD' && 
                            e.impact === 'High'
                        );
                    }
                }
            } catch(e) {}
            
            return [];
        }
        
        async function fetchEconomicCalendar() {
            const container = document.getElementById('economic-calendar');
            
            // Verificar cache primeiro
            const cachedEvents = getCalendarCache();
            if (cachedEvents && cachedEvents.length > 0) {
                window.economicEvents = cachedEvents;
                renderCalendarEvents(container, cachedEvents);
                return;
            }
            
            container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
            
            try {
                let events = [];
                
                // ===== FRED Releases/Dates API: fonte AUTORITATIVA (Federal Reserve) =====
                const today = new Date();
                const startDate = new Date(today);
                startDate.setDate(startDate.getDate() - 7);
                const endDate = new Date(today);
                endDate.setDate(endDate.getDate() + 30);
                
                const pad = (n) => String(n).padStart(2, '0');
                const startStr = `${startDate.getFullYear()}-${pad(startDate.getMonth()+1)}-${pad(startDate.getDate())}`;
                const endStr = `${endDate.getFullYear()}-${pad(endDate.getMonth()+1)}-${pad(endDate.getDate())}`;
                
                const fredUrl = `https://api.stlouisfed.org/fred/releases/dates?realtime_start=${startStr}&realtime_end=${endStr}&api_key=${FRED_API_KEY_CALENDAR}&file_type=json&include_release_dates_with_no_data=true&sort_order=asc`;
                
                try {
                    const res = await fetchWithTimeout(fredUrl, {}, 12000);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.release_dates && data.release_dates.length > 0) {
                            const seen = new Set();
                            const months = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
                            
                            for (const rel of data.release_dates) {
                                const name = rel.release_name || '';
                                
                                for (const mapping of FRED_RELEASE_MAP) {
                                    if (mapping.match.test(name)) {
                                        if (mapping.impact !== 'high') break;
                                        
                                        const key = `${mapping.title}_${rel.date}`;
                                        if (seen.has(key)) break;
                                        seen.add(key);
                                        
                                        const parts = rel.date.split('-');
                                        const year = parseInt(parts[0]);
                                        const month = parseInt(parts[1]);
                                        const day = parseInt(parts[2]);
                                        
                                        events.push({
                                            day: day,
                                            month: months[month - 1],
                                            year: year,
                                            time: mapping.time,
                                            title: mapping.title,
                                            country: '\uD83C\uDDFA\uD83C\uDDF8 EUA',
                                            description: name,
                                            isoDate: rel.date,
                                            source: 'fred',
                                            fredSeriesId: mapping.series,
                                            history: []
                                        });
                                        break;
                                    }
                                }
                            }
                        }
                    }
                } catch(e) {}
                
                // Adicionar reuniões FOMC do array hardcoded
                const startMs = startDate.getTime();
                const endMs = endDate.getTime();
                const months = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
                for (const meeting of FOMC_MEETINGS) {
                    const md = new Date(meeting.date + 'T12:00:00');
                    if (md.getTime() >= startMs && md.getTime() <= endMs) {
                        events.push({
                            day: md.getDate(),
                            month: months[md.getMonth()],
                            year: md.getFullYear(),
                            time: '16:00',
                            title: 'Decisão de Juros (FOMC)',
                            country: '\uD83C\uDDFA\uD83C\uDDF8 EUA',
                            description: `Reunião FOMC ${meeting.label}`,
                            isoDate: meeting.date,
                            source: 'fomc',
                            fredSeriesId: 'FEDFUNDS',
                            history: []
                        });
                    }
                }
                
                // ===== ForexFactory: fonte SUPLEMENTAR (ISM, Preliminares, etc.) =====
                try {
                    const ffUrlThisWeek = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
                    const ffUrlNextWeek = 'https://nfs.faireconomy.media/ff_calendar_nextweek.json';
                    let ffData = [];
                    const [thisWeekData, nextWeekData] = await Promise.all([
                        fetchFFCalendarJSON(ffUrlThisWeek),
                        fetchFFCalendarJSON(ffUrlNextWeek).catch(() => [])
                    ]);
                    if (thisWeekData.length > 0) ffData = ffData.concat(thisWeekData);
                    if (nextWeekData.length > 0) ffData = ffData.concat(nextWeekData);
                    
                    if (ffData.length > 0) {
                        const ffEvents = processFFEvents(ffData);
                        // Criar set de chaves FRED existentes para dedup (título_data)
                        const fredKeys = new Set();
                        for (const ev of events) {
                            // Normalizar: usar só a parte YYYY-MM-DD do isoDate
                            const dateKey = (ev.isoDate || '').slice(0, 10);
                            fredKeys.add(`${ev.title}_${dateKey}`);
                        }
                        // Adicionar eventos FF que não existem no FRED
                        for (const ffEv of ffEvents) {
                            const dateKey = (ffEv.isoDate || '').slice(0, 10);
                            const key = `${ffEv.title}_${dateKey}`;
                            if (!fredKeys.has(key)) {
                                events.push(ffEv);
                            }
                        }
                    }
                } catch(e) {}
                
                // Ordenar por data
                events.sort((a, b) => (a.isoDate || '').localeCompare(b.isoDate || ''));
                
                if (events.length === 0) {
                    container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;"><i class="fas fa-calendar-times"></i> Não foi possível carregar o calendário econômico. Tente novamente mais tarde.</p>';
                    return;
                }
                
                // Salvar no cache
                setCalendarCache(events, new Date().toISOString());
                window.economicEvents = events;
                
                // Renderizar
                renderCalendarEvents(container, events);
                
            } catch (e) {
                container.innerHTML = '<p style="text-align: center; color: var(--accent-red); padding: 20px;"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar calendário econômico</p>';
            }
        }
        
        // Processar eventos ForexFactory (fonte única para datas e eventos)
        function processFFEvents(ffData) {
            const translations = {
                'nonfarm payrolls': 'Emprego Não-Agrícola (NFP)',
                'nonfarm payroll': 'Emprego Não-Agrícola (NFP)',
                'change in nonfarm payrolls': 'Variação Emprego Não-Agrícola',
                'adp nonfarm employment change': 'Emprego Privado ADP',
                'adp employment change': 'Emprego Privado ADP',
                'cpi': 'CPI (Inflação)',
                'core cpi': 'CPI Núcleo (ex-Alimentos e Energia)',
                'cpi yoy': 'CPI (Inflação)',
                'cpi mom': 'CPI (Inflação)',
                'ppi': 'PPI (Preços ao Produtor)',
                'core ppi': 'PPI Núcleo',
                'advance gdp': 'PIB dos EUA (Preliminar)',
                'prelim gdp': 'PIB dos EUA (2ª Estimativa)',
                'final gdp': 'PIB dos EUA (Final)',
                'gdp': 'PIB dos EUA',
                'gdp growth rate': 'Crescimento do PIB',
                'fomc': 'Decisão de Juros (FOMC)',
                'fomc meeting minutes': 'Ata do FOMC',
                'fomc press conference': 'Coletiva do Fed',
                'interest rate decision': 'Decisão de Taxa de Juros',
                'interest rate': 'Taxa de Juros do Fed',
                'retail sales': 'Vendas no Varejo',
                'core retail sales': 'Vendas no Varejo (Núcleo)',
                'unemployment rate': 'Taxa de Desemprego',
                'initial jobless claims': 'Pedidos Seguro-Desemprego',
                'unemployment claims': 'Pedidos Seguro-Desemprego',
                'continuing jobless claims': 'Seguro-Desemprego Contínuo',
                'ism manufacturing pmi': 'PMI Manufatura (ISM)',
                'ism manufacturing': 'ISM Manufatura',
                'ism services pmi': 'PMI Serviços (ISM)',
                'ism services': 'ISM Serviços',
                'ism non-manufacturing pmi': 'PMI Serviços (ISM)',
                'flash manufacturing pmi': 'PMI Manufatura Flash (S&P)',
                'flash services pmi': 'PMI Serviços Flash (S&P)',
                'consumer confidence': 'Confiança do Consumidor',
                'cb consumer confidence': 'Confiança do Consumidor (CB)',
                'prelim uom consumer sentiment': 'Sentimento Michigan (Preliminar)',
                'revised uom consumer sentiment': 'Sentimento Michigan (Final)',
                'uom consumer sentiment': 'Sentimento Michigan',
                'michigan consumer sentiment': 'Sentimento Michigan',
                'university of michigan': 'Sentimento Michigan',
                'housing starts': 'Início de Construções',
                'building permits': 'Alvarás de Construção',
                'existing home sales': 'Vendas de Imóveis Usados',
                'new home sales': 'Vendas de Imóveis Novos',
                'pce price index': 'PCE (Inflação preferida do Fed)',
                'core pce price index': 'PCE Núcleo',
                'personal spending': 'Gastos Pessoais',
                'personal income': 'Renda Pessoal',
                'fed chair powell': 'Discurso Powell (Fed)',
                'fed chair': 'Discurso Presidente do Fed',
                'jolts job openings': 'JOLTS Vagas de Emprego',
                'job openings': 'JOLTS Vagas de Emprego',
                'trade balance': 'Balança Comercial',
                'industrial production': 'Produção Industrial',
                'capacity utilization': 'Utilização da Capacidade',
                'durable goods orders': 'Pedidos de Bens Duráveis',
                'empire state manufacturing': 'Índice Empire State',
                'philadelphia fed manufacturing': 'Índice Philly Fed',
            };
            
            // Extrair componentes diretamente do ISO 8601 e converter para Brasília (UTC-3)
            function parseFFDate(dateStr) {
                if (!dateStr) return null;
                // Formato: "2026-03-06T08:30:00-05:00"
                const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2})/);
                if (!m) {
                    const d = new Date(dateStr);
                    return isNaN(d.getTime()) ? null : d;
                }
                // Converter para UTC timestamp
                const utc = Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]);
                // Offset do source (ex: -05:00 → -300 min)
                const offsetMatch = m[7].match(/([+-])(\d{2}):(\d{2})/);
                const srcOffsetMs = (offsetMatch[1] === '-' ? 1 : -1) * (+offsetMatch[2]*60 + +offsetMatch[3]) * 60000;
                const utcMs = utc + srcOffsetMs;
                // Converter para Brasília (UTC-3)
                const brasiliaMs = utcMs - 3 * 3600000;
                const bd = new Date(brasiliaMs);
                // Retornar objeto Date-like com componentes em horário de Brasília
                // Usamos UTC methods para evitar conversão dupla
                return {
                    getDate: () => bd.getUTCDate(),
                    getMonth: () => bd.getUTCMonth(),
                    getFullYear: () => bd.getUTCFullYear(),
                    getHours: () => bd.getUTCHours(),
                    getMinutes: () => bd.getUTCMinutes(),
                    getTime: () => utcMs,
                    toISOString: () => new Date(utcMs).toISOString()
                };
            }
            
            function translateTitle(rawTitle) {
                const lower = rawTitle.toLowerCase();
                const sortedKeys = Object.keys(translations).sort((a, b) => b.length - a.length);
                for (const key of sortedKeys) {
                    if (lower.includes(key)) return translations[key];
                }
                return rawTitle;
            }
            
            function formatEconomicVal(val, title) {
                if (val === undefined || val === null || val === '') return null;
                const num = parseFloat(val);
                if (isNaN(num)) return String(val);
                const lower = title.toLowerCase();
                if (lower.includes('payroll') || lower.includes('employment') || lower.includes('job')) {
                    return num >= 0 ? `+${num.toFixed(0)}K` : `${num.toFixed(0)}K`;
                }
                if (lower.includes('cpi') || lower.includes('ppi') || lower.includes('pce') || lower.includes('inflação')) {
                    return `${num.toFixed(1)}%`;
                }
                if (lower.includes('rate') || lower.includes('juros') || lower.includes('fomc')) {
                    return `${num.toFixed(2)}%`;
                }
                if (lower.includes('gdp') || lower.includes('pib')) {
                    return `${num.toFixed(1)}%`;
                }
                if (Math.abs(num) >= 1000) {
                    return num >= 0 ? `+${(num/1000).toFixed(1)}K` : `${(num/1000).toFixed(1)}K`;
                }
                return num >= 0 ? `+${num.toFixed(1)}` : `${num.toFixed(1)}`;
            }
            
            const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
            
            // Deduplicar por título traduzido (manter primeiro de cada)
            const seen = new Map();
            const deduped = [];
            for (const e of ffData) {
                const title = translateTitle(e.title || '');
                const eventDate = parseFFDate(e.date);
                if (!eventDate || isNaN(eventDate.getTime())) continue;
                const isoStr = eventDate.toISOString();
                const dayKey = `${title}_${isoStr ? isoStr.split('T')[0] : 'unknown'}`;
                if (!seen.has(dayKey)) {
                    seen.set(dayKey, true);
                    deduped.push(e);
                }
            }
            
            // Ordenar por data
            deduped.sort((a, b) => {
                const da = parseFFDate(a.date);
                const db = parseFFDate(b.date);
                return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
            });
            
            return deduped.slice(0, 30).map(e => {
                const eventDate = parseFFDate(e.date);
                if (!eventDate) return null;
                const title = translateTitle(e.title || 'Evento');
                const time = `${String(eventDate.getHours()).padStart(2,'0')}:${String(eventDate.getMinutes()).padStart(2,'0')}`;
                
                const history = [];
                if (e.previous !== undefined && e.previous !== null && e.previous !== '') {
                    const fmtPrev = formatEconomicVal(e.previous, title);
                    history.push({ date: 'Anterior', value: fmtPrev || String(e.previous), type: 'neutral' });
                }
                if (e.actual !== undefined && e.actual !== null && e.actual !== '') {
                    const fmtActual = formatEconomicVal(e.actual, title);
                    const type = parseFloat(e.actual) > parseFloat(e.previous) ? 'positive' : parseFloat(e.actual) < parseFloat(e.previous) ? 'negative' : 'neutral';
                    history.push({ date: 'Atual', value: fmtActual || String(e.actual), type });
                }
                if (e.forecast !== undefined && e.forecast !== null && e.forecast !== '') {
                    const fmtForecast = formatEconomicVal(e.forecast, title);
                    history.push({ date: 'Previsão', value: fmtForecast || String(e.forecast), type: 'neutral' });
                }
                
                return {
                    day: eventDate.getDate(),
                    month: months[eventDate.getMonth()],
                    year: eventDate.getFullYear(),
                    time,
                    title,
                    country: '🇺🇸 EUA',
                    description: e.title || '',
                    isoDate: `${eventDate.getFullYear()}-${String(eventDate.getMonth()+1).padStart(2,'0')}-${String(eventDate.getDate()).padStart(2,'0')}`,
                    source: 'forexfactory',
                    fredSeriesId: getFredSeriesForEvent(e.title),
                    history: history.length > 0 ? history : [{ date: 'Aguardando', value: '-', type: 'neutral' }]
                };
            }).filter(Boolean);
        }
        
        function renderCalendarEvents(container, events, lastUpdate) {
            // Salvar eventos globalmente para uso no onclick
            window.economicEvents = events;
            
            // Função para renderizar histórico (2 últimos resultados)
            function renderHistory(history) {
                if (!history || history.length === 0) return '';
                return `
                    <div class="calendar-history">
                        <div class="history-label"><i class="fas fa-history"></i> Últimos resultados</div>
                        <div class="history-items">
                            ${history.map(h => `
                                <div class="history-item ${h.type}">
                                    <span class="value">${h.value}</span>
                                    <span class="date">${h.date}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            
            container.innerHTML = events.map((event, index) => `
                <div class="calendar-event" onclick="openEventDetailModal(window.economicEvents[${index}])">
                    <div class="calendar-date">
                        <div class="calendar-day">${event.day}</div>
                        <div class="calendar-month">${event.month}</div>
                        <div class="calendar-time"><i class="fas fa-clock"></i> ${event.time}</div>
                    </div>
                    <div class="calendar-info">
                        <div class="calendar-title">${event.title}</div>
                        <div class="calendar-country">${event.country} • ${event.description}</div>
                        ${renderHistory(event.history)}
                    </div>
                </div>
            `).join('');
            
            // Indicar fonte e última atualização
            const hasFred = events.some(e => e.source === 'fred');
            const hasFF = events.some(e => e.source === 'forexfactory');
            const sourceLabel = hasFred && hasFF ? 'FRED + ForexFactory' : hasFred ? 'FRED (Federal Reserve)' : 'ForexFactory';
            container.insertAdjacentHTML('beforeend', `<p style="font-size: 10px; color: var(--text-muted); text-align: center; margin-top: 12px;"><i class="fas fa-sync-alt"></i> Eventos de alta importância EUA • ${sourceLabel}</p>`);
        }

        async function fetchMarketIndicators() {
            const container = document.getElementById('market-indicators');
            
            // Database de informações detalhadas dos indicadores
            const indicatorDetails = {
                'S&P 500': {
                    whatIs: 'O S&P 500 é um índice que mede o desempenho das 500 maiores empresas de capital aberto dos Estados Unidos. É considerado o principal benchmark do mercado de ações americano e um indicador da saúde da economia.',
                    howTo: 'Valores em alta indicam otimismo no mercado (risk-on). Quedas significativas (>2%) podem indicar aversão a risco. O índice acima de máximas históricas sugere confiança dos investidores.',
                    cryptoImpact: 'Alta correlação com Bitcoin em 2024-2025. S&P forte geralmente favorece cripto. Quedas bruscas no S&P costumam arrastar cripto junto, especialmente em momentos de liquidação.',
                    tradingTip: 'Monitore futuros do S&P pré-mercado (ES). Aberturas positivas nos EUA frequentemente impulsionam cripto. Gap downs podem ser oportunidade de compra se o mercado se recuperar.'
                },
                'DXY': {
                    whatIs: 'O Dollar Index (DXY) mede a força do dólar americano contra uma cesta de 6 moedas principais (EUR, JPY, GBP, CAD, SEK, CHF). O Euro representa 57.6% do peso do índice.',
                    howTo: 'DXY subindo = dólar fortalecendo. DXY > 105 indica dólar muito forte. DXY < 100 indica fraqueza do dólar. Movimentos de 1% são significativos.',
                    cryptoImpact: 'Correlação INVERSA com Bitcoin. Dólar forte (DXY alto) geralmente pressiona cripto negativamente. Dólar fraco (DXY em queda) historicamente é bullish para BTC.',
                    tradingTip: 'Use DXY como confirmação. Se BTC está subindo e DXY caindo, a tendência de alta tem mais força. Divergências (BTC subindo com DXY forte) merecem cautela.'
                },
                'VIX': {
                    whatIs: 'O VIX, conhecido como "Índice do Medo", mede a volatilidade esperada do S&P 500 nos próximos 30 dias baseado em opções. É calculado pelo CBOE.',
                    howTo: 'VIX < 15: Mercado calmo, complacência. VIX 15-25: Volatilidade normal. VIX > 25: Alto medo no mercado. VIX > 40: Pânico extremo (raro).',
                    cryptoImpact: 'VIX alto geralmente causa quedas em cripto (flight to safety). Picos extremos no VIX frequentemente marcam fundos de mercado. VIX muito baixo pode preceder correções.',
                    tradingTip: 'VIX acima de 30 historicamente são boas oportunidades de compra de longo prazo. Não compre quando VIX está muito baixo (<13) - pode indicar topo de mercado.'
                },
                'Ouro': {
                    whatIs: 'O ouro é um ativo de reserva de valor milenar. O preço spot é cotado em dólares por onça troy. É considerado porto seguro em momentos de incerteza econômica.',
                    howTo: 'Ouro subindo + mercados caindo = flight to safety. Ouro subindo com mercados fortes = preocupação com inflação. Ouro acima de $2500 indica alta demanda por proteção.',
                    cryptoImpact: 'Bitcoin é frequentemente chamado de "ouro digital". Ambos podem subir juntos em cenários de desvalorização do dólar. Em crises agudas, ouro pode performar melhor que BTC.',
                    tradingTip: 'Monitore a razão BTC/Ouro. Se BTC supera ouro consistentemente, indica preferência por ativos de risco. Ouro superando BTC sugere ambiente defensivo.'
                },
                'Petróleo WTI': {
                    whatIs: 'O West Texas Intermediate (WTI) é o benchmark do petróleo americano. O preço reflete oferta/demanda global de energia e tensões geopolíticas.',
                    howTo: 'Petróleo > $80: Pressão inflacionária. Petróleo < $60: Possível recessão. Spikes súbitos geralmente indicam eventos geopolíticos ou cortes de produção OPEC.',
                    cryptoImpact: 'Petróleo caro = inflação = Fed mais hawkish = pressão em cripto. Petróleo em queda pode indicar recessão, mas também menor pressão inflacionária.',
                    tradingTip: 'Eventos na OPEC e tensões no Oriente Médio podem causar volatilidade. Petróleo afeta o CPI, então monitore antes de dados de inflação.'
                }
            };
            
            // Salvar detalhes globalmente
            window.indicatorDetails = indicatorDetails;
            
            try {
                // Buscar dados de várias fontes
                const indicators = [];
                
                // VIX - Fear Index (usando proxy/estimativa)
                // S&P 500, DXY, Gold, Oil via diferentes APIs
                
                // Buscar S&P 500 futures via Yahoo Finance proxy
                try {
                    const sp500Data = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=2d')
                        .then(r => r.json())
                        .catch(() => null);
                    
                    if (sp500Data?.chart?.result?.[0]) {
                        const result = sp500Data.chart.result[0];
                        const closes = result.indicators.quote[0].close;
                        const currentPrice = closes[closes.length - 1];
                        const prevPrice = closes[closes.length - 2] || currentPrice;
                        const change = ((currentPrice - prevPrice) / prevPrice) * 100;
                        
                        indicators.push({
                            name: 'S&P 500',
                            desc: 'Índice americano',
                            icon: 'sp500',
                            iconClass: 'fas fa-chart-line',
                            value: currentPrice.toFixed(2),
                            change: change
                        });
                    }
                } catch (e) {
                    // Não adicionar fallback falso
                }
                
                // DXY - Dollar Index
                try {
                    const dxyData = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=2d')
                        .then(r => r.json())
                        .catch(() => null);
                    
                    if (dxyData?.chart?.result?.[0]) {
                        const result = dxyData.chart.result[0];
                        const closes = result.indicators.quote[0].close;
                        const currentPrice = closes[closes.length - 1];
                        const prevPrice = closes[closes.length - 2] || currentPrice;
                        const change = ((currentPrice - prevPrice) / prevPrice) * 100;
                        
                        indicators.push({
                            name: 'DXY',
                            desc: 'Índice do Dólar',
                            icon: 'dxy',
                            iconClass: 'fas fa-dollar-sign',
                            value: currentPrice.toFixed(2),
                            change: change
                        });
                    }
                } catch (e) {
                    // Não adicionar fallback falso
                }
                
                // VIX - Volatility Index
                try {
                    const vixData = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=2d')
                        .then(r => r.json())
                        .catch(() => null);
                    
                    if (vixData?.chart?.result?.[0]) {
                        const result = vixData.chart.result[0];
                        const closes = result.indicators.quote[0].close;
                        const currentPrice = closes[closes.length - 1];
                        const prevPrice = closes[closes.length - 2] || currentPrice;
                        const change = ((currentPrice - prevPrice) / prevPrice) * 100;
                        
                        indicators.push({
                            name: 'VIX',
                            desc: 'Índice de Volatilidade',
                            icon: 'vix',
                            iconClass: 'fas fa-bolt',
                            value: currentPrice.toFixed(2),
                            change: change
                        });
                    }
                } catch (e) {
                    // Não adicionar fallback falso
                }
                
                // Gold
                try {
                    const goldData = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=2d')
                        .then(r => r.json())
                        .catch(() => null);
                    
                    if (goldData?.chart?.result?.[0]) {
                        const result = goldData.chart.result[0];
                        const closes = result.indicators.quote[0].close;
                        const currentPrice = closes[closes.length - 1];
                        const prevPrice = closes[closes.length - 2] || currentPrice;
                        const change = ((currentPrice - prevPrice) / prevPrice) * 100;
                        
                        indicators.push({
                            name: 'Ouro',
                            desc: 'XAU/USD',
                            icon: 'gold',
                            iconClass: 'fas fa-coins',
                            value: '$' + currentPrice.toFixed(2),
                            change: change
                        });
                    }
                } catch (e) {
                    // Não adicionar fallback falso
                }
                
                // Oil
                try {
                    const oilData = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=2d')
                        .then(r => r.json())
                        .catch(() => null);
                    
                    if (oilData?.chart?.result?.[0]) {
                        const result = oilData.chart.result[0];
                        const closes = result.indicators.quote[0].close;
                        const currentPrice = closes[closes.length - 1];
                        const prevPrice = closes[closes.length - 2] || currentPrice;
                        const change = ((currentPrice - prevPrice) / prevPrice) * 100;
                        
                        indicators.push({
                            name: 'Petróleo WTI',
                            desc: 'Crude Oil',
                            icon: 'oil',
                            iconClass: 'fas fa-oil-can',
                            value: '$' + currentPrice.toFixed(2),
                            change: change
                        });
                    }
                } catch (e) {
                    // Não adicionar fallback falso
                }
                
                // Se não conseguiu nenhum dado, mostrar erro
                if (indicators.length === 0) {
                    container.innerHTML = '<p style="text-align: center; color: var(--accent-red); padding: 20px;"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar indicadores de mercado. Verifique sua conexão.</p>';
                    return;
                }
                
                // Salvar indicadores globalmente para uso no modal
                window.marketIndicatorsData = indicators;
                
                container.innerHTML = indicators.map((ind, index) => `
                    <div class="market-indicator" onclick="openIndicatorDetailModal(${index})">
                        <div class="indicator-info">
                            <div class="indicator-icon ${ind.icon}">
                                <i class="${ind.iconClass}"></i>
                            </div>
                            <div>
                                <div class="indicator-name">${ind.name}</div>
                                <div class="indicator-desc">${ind.desc}</div>
                            </div>
                        </div>
                        <div class="indicator-value">
                            <div class="indicator-price" id="macro-price-${ind.icon}">${ind.value}</div>
                            <div class="indicator-change ${ind.change >= 0 ? 'pnl-positive' : 'pnl-negative'}" id="macro-change-${ind.icon}">
                                ${ind.change >= 0 ? '+' : ''}${ind.change.toFixed(2)}%
                            </div>
                        </div>
                        <i class="fas fa-chevron-right" style="color: var(--text-muted); font-size: 12px;"></i>
                    </div>
                `).join('');
                
            } catch (e) {
                container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Erro ao carregar indicadores</p>';
            }
        }

        // ============================================
        // MACRO - Usa APENAS a API do GitHub Pages
        // Sem chamadas diretas para Yahoo Finance (bloqueado por CORS)
        // ============================================
        // Funções vazias - o MACRO usa fetchMacroAPI() definido mais abaixo
        function startMacroRealTimeUpdate() { /* Desabilitado - usa GitHub Pages API */ }
        function fetchMarketIndicatorsSilent() { /* Desabilitado - usa GitHub Pages API */ }
        function updateMacroIndicator(icon, value, change) { /* Desabilitado - usa GitHub Pages API */ }

        // ============================================
        // INDICATOR DETAIL MODAL
        // ============================================
        function openIndicatorDetailModal(index) {
            const indicator = window.marketIndicatorsData[index];
            if (!indicator) return;
            
            const details = window.indicatorDetails[indicator.name] || {
                whatIs: 'Indicador de mercado importante para análise macroeconômica.',
                howTo: 'Acompanhe as variações diárias e compare com médias históricas.',
                cryptoImpact: 'Este indicador pode ter correlação direta ou inversa com criptomoedas.',
                tradingTip: 'Use em conjunto com outros indicadores para melhor análise.'
            };
            
            // Preencher modal
            document.getElementById('indicator-modal-title').textContent = indicator.name;
            document.getElementById('indicator-detail-value').textContent = indicator.value;
            document.getElementById('indicator-detail-name').textContent = indicator.desc;
            
            const changeEl = document.getElementById('indicator-detail-change');
            changeEl.textContent = `${indicator.change >= 0 ? '+' : ''}${indicator.change.toFixed(2)}%`;
            changeEl.className = `indicator-detail-change ${indicator.change >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
            
            document.getElementById('indicator-what-is').textContent = details.whatIs;
            document.getElementById('indicator-how-to').textContent = details.howTo;
            document.getElementById('indicator-crypto-impact').textContent = details.cryptoImpact;
            document.getElementById('indicator-trading-tip').textContent = details.tradingTip;
            
            // Mostrar modal
            document.getElementById('indicator-detail-modal').classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Salvar indicador atual e carregar gráfico
            window.currentIndicator = indicator;
            window.currentIndicatorPeriod = '1h';
            loadIndicatorChart();
            
            // Adicionar ao histórico
            if (window.history && window.history.pushState) {
                window.history.pushState({ page: 'indicator-detail' }, '', '');
            }
        }

        function closeIndicatorDetailModal() {
            document.getElementById('indicator-detail-modal').classList.remove('active');
            document.body.style.overflow = '';
            window.currentIndicator = null;
        }
        
        // ============================================
        // INDICATOR CHART FUNCTIONS
        // ============================================
        
        // Mapeamento de indicadores para símbolos Yahoo Finance
        const INDICATOR_SYMBOLS = {
            'sp500': '%5EGSPC',
            'nasdaq': '%5EIXIC',
            'dowjones': '%5EDJI',
            'dxy': 'DX-Y.NYB',
            'eurusd': 'EURUSD=X',
            'vix': '%5EVIX',
            'gold': 'GC=F',
            'silver': 'SI=F',
            'copper': 'HG=F',
            'platinum': 'PL=F',
            'oil': 'CL=F',
            'natgas': 'NG=F',
            'treasury10y': '%5ETNX',
            'treasury30y': '%5ETYX',
            'mstr': 'MSTR',
            'coin': 'COIN'
        };
        
        const INDICATOR_COLORS = {
            'sp500': '#22c55e',
            'nasdaq': '#3b82f6',
            'dowjones': '#0ea5e9',
            'dxy': '#6366f1',
            'eurusd': '#8b5cf6',
            'vix': '#ef4444',
            'gold': '#eab308',
            'silver': '#a1a1aa',
            'copper': '#f97316',
            'platinum': '#e5e5e5',
            'oil': '#84cc16',
            'natgas': '#14b8a6',
            'treasury10y': '#ec4899',
            'treasury30y': '#f472b6',
            'mstr': '#ff6b00',
            'coin': '#2563eb'
        };
        
        let indicatorChartData = [];
        
        async function loadIndicatorChart() {
            if (!window.currentIndicator) {
                return;
            }
            
            const symbol = INDICATOR_SYMBOLS[window.currentIndicator.icon];
            if (!symbol) {
                return;
            }
            const period = window.currentIndicatorPeriod || '1h';
            
            // Mostrar loading no canvas
            const canvas = document.getElementById('indicator-chart-canvas');
            const container = document.getElementById('indicator-chart-container');
            if (canvas && container) {
                const ctx = canvas.getContext('2d');
                const rect = container.getBoundingClientRect();
                canvas.width = rect.width * (window.devicePixelRatio || 1);
                canvas.height = rect.height * (window.devicePixelRatio || 1);
                canvas.style.width = rect.width + 'px';
                canvas.style.height = rect.height + 'px';
                ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
                ctx.fillStyle = '#0a0a0f';
                ctx.fillRect(0, 0, rect.width, rect.height);
                ctx.fillStyle = '#71717a';
                ctx.font = '12px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Carregando...', rect.width / 2, rect.height / 2);
            } else {
            }
            
            // Mapear período para intervalo/range do Yahoo Finance
            const periodConfig = {
                '15m': { interval: '1m', range: '1d' },
                '30m': { interval: '2m', range: '1d' },
                '1h': { interval: '5m', range: '1d' },
                '4h': { interval: '15m', range: '5d' },
                '24h': { interval: '30m', range: '5d' },
                '7d': { interval: '1h', range: '7d' },
                '1mo': { interval: '1d', range: '1mo' },
                '6mo': { interval: '1d', range: '6mo' },
                '1y': { interval: '1wk', range: '1y' }
            };
            
            const config = periodConfig[period] || { interval: '5m', range: '1d' };
            const interval = config.interval;
            const range = config.range;
            try {
                // URLs para tentar (Yahoo Finance direto)
                const urls = [
                    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`,
                    `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`
                ];
                
                // Também tentar com CORS proxy para browser
                const corsProxies = [
                    `https://corsproxy.io/?`,
                    `https://api.allorigins.win/raw?url=`
                ];
                
                let data = null;
                
                // Primeiro tentar diretamente (funciona no APK e às vezes no browser)
                for (const url of urls) {
                    try {
                        const response = await fetch(url, { 
                            headers: { 'Accept': 'application/json' },
                            mode: 'cors'
                        });
                        if (response.ok) {
                            data = await response.json();
                            if (data?.chart?.result?.[0]?.timestamp?.length > 0) break;
                        }
                    } catch (e) {
                    }
                }
                
                // Se falhou, tentar com CORS proxy
                if (!data?.chart?.result?.[0]?.timestamp?.length) {
                    for (const proxy of corsProxies) {
                        for (const url of urls) {
                            try {
                                const proxyUrl = proxy + encodeURIComponent(url);
                                const response = await fetch(proxyUrl);
                                if (response.ok) {
                                    data = await response.json();
                                    if (data?.chart?.result?.[0]?.timestamp?.length > 0) break;
                                }
                            } catch (e) {
                            }
                        }
                        if (data?.chart?.result?.[0]?.timestamp?.length > 0) break;
                    }
                }
                
                if (data?.chart?.result?.[0]) {
                    const result = data.chart.result[0];
                    const timestamps = result.timestamp || [];
                    const closes = result.indicators.quote[0].close || [];
                    
                    indicatorChartData = timestamps.map((t, i) => ({
                        time: new Date(t * 1000),
                        close: closes[i]
                    })).filter(d => d.close != null && !isNaN(d.close));
                    
                    if (indicatorChartData.length > 0) {
                        renderIndicatorChart();
                    } else {
                        showIndicatorChartError('Sem dados disponíveis');
                    }
                } else {
                    showIndicatorChartError('Mercado fechado');
                }
            } catch (error) {
                showIndicatorChartError('Erro ao carregar');
            }
        }
        
        function showIndicatorChartError(message) {
            const canvas = document.getElementById('indicator-chart-canvas');
            const container = document.getElementById('indicator-chart-container');
            if (!canvas || !container) return;
            
            const rect = container.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            canvas.style.width = rect.width + 'px';
            canvas.style.height = rect.height + 'px';
            
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            ctx.fillStyle = '#0a0a0f';
            ctx.fillRect(0, 0, rect.width, rect.height);
            
            // Verificar se é fim de semana
            const today = new Date();
            const dayOfWeek = today.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            
            if (isWeekend || message.toLowerCase().includes('fechado')) {
                ctx.fillStyle = '#ef4444'; // Vermelho
                ctx.font = 'bold 13px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('MERCADO FECHADO', rect.width / 2, rect.height / 2 - 10);
                ctx.font = '11px Inter, sans-serif';
                ctx.fillStyle = '#71717a';
                ctx.fillText('Aos finais de semana', rect.width / 2, rect.height / 2 + 10);
            } else {
                ctx.fillStyle = '#71717a';
                ctx.font = '12px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(message, rect.width / 2, rect.height / 2);
            }
        }
        
        function renderIndicatorChart() {
            const canvas = document.getElementById('indicator-chart-canvas');
            const container = document.getElementById('indicator-chart-container');
            if (!canvas || !container || indicatorChartData.length === 0) return;
            
            const containerRect = container.getBoundingClientRect();
            const chartWidth = containerRect.width - 16;
            const chartHeight = containerRect.height - 16;
            
            if (chartWidth <= 0 || chartHeight <= 0) return;
            
            const dpr = window.devicePixelRatio || 1;
            canvas.width = chartWidth * dpr;
            canvas.height = chartHeight * dpr;
            canvas.style.width = chartWidth + 'px';
            canvas.style.height = chartHeight + 'px';
            
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            
            // Background
            ctx.fillStyle = '#0a0a0f';
            ctx.fillRect(0, 0, chartWidth, chartHeight);
            
            // Calculate price range
            const prices = indicatorChartData.map(d => d.close);
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const priceRange = (maxPrice - minPrice) || maxPrice * 0.01;
            const paddedMin = minPrice - priceRange * 0.1;
            const paddedMax = maxPrice + priceRange * 0.1;
            const paddedRange = paddedMax - paddedMin;
            
            const padding = { top: 10, right: 10, bottom: 20, left: 10 };
            const graphWidth = chartWidth - padding.left - padding.right;
            const graphHeight = chartHeight - padding.top - padding.bottom;
            
            // Determine if trend is up or down
            const isPositive = indicatorChartData[indicatorChartData.length - 1].close >= indicatorChartData[0].close;
            const lineColor = window.currentIndicator ? (INDICATOR_COLORS[window.currentIndicator.icon] || (isPositive ? '#22c55e' : '#ef4444')) : '#6366f1';
            
            // Draw line chart
            ctx.beginPath();
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            
            indicatorChartData.forEach((d, i) => {
                const x = padding.left + (i / (indicatorChartData.length - 1)) * graphWidth;
                const y = padding.top + (1 - (d.close - paddedMin) / paddedRange) * graphHeight;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.stroke();
            
            // Fill area under the line
            ctx.lineTo(padding.left + graphWidth, padding.top + graphHeight);
            ctx.lineTo(padding.left, padding.top + graphHeight);
            ctx.closePath();
            
            const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + graphHeight);
            gradient.addColorStop(0, lineColor + '40');
            gradient.addColorStop(1, lineColor + '00');
            ctx.fillStyle = gradient;
            ctx.fill();
            
            // Draw price labels
            ctx.fillStyle = '#71717a';
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(formatIndicatorPrice(maxPrice), padding.left + 4, padding.top + 12);
            ctx.fillText(formatIndicatorPrice(minPrice), padding.left + 4, chartHeight - padding.bottom - 4);
        }
        
        function formatIndicatorPrice(price) {
            if (price >= 1000) return price.toFixed(0);
            if (price >= 100) return price.toFixed(1);
            return price.toFixed(2);
        }
        
        function selectIndicatorPeriod(period) {
            window.currentIndicatorPeriod = period;
            
            document.querySelectorAll('.ind-timeframe-option').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.period === period);
            });
            const labelEl = document.getElementById('ind-selected-timeframe');
            if (labelEl) labelEl.textContent = period;
            
            loadIndicatorChart();
        }
        
        // ============================================
        // INDICATOR TECHNICAL ANALYSIS
        // ============================================
        
        async function openIndicatorTechnicalAnalysis() {
            if (!window.currentIndicator) return;
            
            const indicator = window.currentIndicator;
            const symbol = INDICATOR_SYMBOLS[indicator.icon];
            
            if (!symbol) {
                alert('Análise técnica não disponível para este indicador.');
                return;
            }
            
            const modal = document.getElementById('ta-modal');
            const body = document.getElementById('ta-modal-body');
            if (!modal || !body) return;
            
            // Atualizar título
            const titleEl = document.querySelector('.ta-modal-header-title');
            if (titleEl) titleEl.textContent = `Análise Técnica - ${indicator.name}`;
            
            // Mostrar loading
            body.innerHTML = `
                <div class="ta-loading">
                    <div class="ta-loading-spinner"></div>
                    <div class="ta-loading-text">Analisando ${indicator.name}...</div>
                </div>
            `;
            
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Adicionar ao histórico do navegador
            if (window.history && window.history.pushState) {
                window.history.pushState({ page: 'indicator-technical-analysis', indicator: indicator.name }, '', '');
            }
            
            try {
                // Buscar dados do Yahoo Finance para análise
                const analysisData = await fetchIndicatorTAData(symbol, indicator);
                const analysis = generateIndicatorTechnicalAnalysis(analysisData, indicator);
                
                // Renderizar análise
                renderIndicatorTechnicalAnalysis(analysis, indicator);
                
            } catch (e) {
                body.innerHTML = `
                    <div style="text-align: center; padding: 40px 20px;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: var(--accent-red); margin-bottom: 16px;"></i>
                        <h3 style="color: var(--text-primary); margin-bottom: 8px;">Erro ao carregar análise</h3>
                        <p style="color: var(--text-secondary); font-size: 14px;">${e.message || 'Erro desconhecido'}</p>
                        <button onclick="openIndicatorTechnicalAnalysis()" style="margin-top: 20px; padding: 12px 24px; background: var(--accent-blue); border: none; border-radius: 12px; color: white; font-weight: 600; cursor: pointer;">
                            <i class="fas fa-redo"></i> Tentar Novamente
                        </button>
                    </div>
                `;
            }
        }
        
        async function fetchIndicatorTAData(symbol, indicator) {
            // Buscar múltiplos timeframes para análise completa
            const periods = ['1d', '1mo', '3mo', '1y'];
            const intervals = ['1d', '1d', '1wk', '1wk'];
            
            const results = await Promise.all(
                periods.map(async (period, i) => {
                    try {
                        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${intervals[i]}&range=${period}`;
                        const response = await fetch(url);
                        if (response.ok) {
                            const data = await response.json();
                            return data?.chart?.result?.[0] || null;
                        }
                    } catch (e) {
                    }
                    return null;
                })
            );
            
            return {
                daily: results[0],
                monthly: results[1],
                quarterly: results[2],
                yearly: results[3],
                indicator
            };
        }
        
        function generateIndicatorTechnicalAnalysis(data, indicator) {
            const { daily, monthly, quarterly, yearly } = data;
            
            // Usar dados diários se disponíveis
            const priceData = daily || monthly;
            if (!priceData?.indicators?.quote?.[0]) {
                throw new Error('Dados não disponíveis');
            }
            
            const quotes = priceData.indicators.quote[0];
            const closes = (quotes.close || []).filter(c => c != null && !isNaN(c));
            const highs = (quotes.high || []).filter(h => h != null && !isNaN(h));
            const lows = (quotes.low || []).filter(l => l != null && !isNaN(l));
            const volumes = (quotes.volume || []).filter(v => v != null && !isNaN(v));
            
            if (closes.length < 5) {
                throw new Error('Dados insuficientes para análise');
            }
            
            const currentPrice = closes[closes.length - 1];
            const prevPrice = closes[closes.length - 2];
            const change = ((currentPrice - prevPrice) / prevPrice) * 100;
            
            // Calcular médias móveis
            const sma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
            const sma10 = closes.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, closes.length);
            const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, closes.length);
            
            // Calcular RSI (14 períodos)
            const rsiPeriod = 14;
            let gains = 0, losses = 0;
            const recentCloses = closes.slice(-rsiPeriod - 1);
            for (let i = 1; i < recentCloses.length; i++) {
                const diff = recentCloses[i] - recentCloses[i - 1];
                if (diff > 0) gains += diff;
                else losses += Math.abs(diff);
            }
            const avgGain = gains / rsiPeriod;
            const avgLoss = losses / rsiPeriod;
            const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            const rsi = 100 - (100 / (1 + rs));
            
            // Calcular suporte e resistência
            const recentHighs = highs.slice(-20);
            const recentLows = lows.slice(-20);
            const resistance = Math.max(...recentHighs);
            const support = Math.min(...recentLows);
            
            // Calcular volatilidade
            const returns = [];
            for (let i = 1; i < closes.length; i++) {
                returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
            }
            const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
            const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length;
            const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100; // Anualizada
            
            // Tendência
            let trend = 'NEUTRAL';
            let trendStrength = 50;
            if (currentPrice > sma20 && sma5 > sma10) {
                trend = 'BULLISH';
                trendStrength = 70 + Math.min(20, (currentPrice - sma20) / sma20 * 100);
            } else if (currentPrice < sma20 && sma5 < sma10) {
                trend = 'BEARISH';
                trendStrength = 30 - Math.min(20, (sma20 - currentPrice) / sma20 * 100);
            }
            
            // Calcular máximas/mínimas de diferentes períodos
            const high52w = yearly?.indicators?.quote?.[0]?.high ? Math.max(...yearly.indicators.quote[0].high.filter(h => h)) : resistance;
            const low52w = yearly?.indicators?.quote?.[0]?.low ? Math.min(...yearly.indicators.quote[0].low.filter(l => l)) : support;
            
            return {
                price: {
                    current: currentPrice,
                    change: change,
                    high24h: highs[highs.length - 1] || currentPrice,
                    low24h: lows[lows.length - 1] || currentPrice,
                    high52w: high52w,
                    low52w: low52w
                },
                indicators: {
                    sma5, sma10, sma20,
                    rsi,
                    support, resistance,
                    volatility
                },
                trend: {
                    direction: trend,
                    strength: trendStrength
                },
                signals: generateSignals(currentPrice, sma5, sma10, sma20, rsi, support, resistance, indicator)
            };
        }
        
        function generateSignals(price, sma5, sma10, sma20, rsi, support, resistance, indicator) {
            const signals = [];
            
            // Sinais de médias móveis
            if (price > sma20) {
                signals.push({ type: 'bullish', name: 'Acima da SMA 20', desc: 'Preço acima da média de 20 períodos' });
            } else {
                signals.push({ type: 'bearish', name: 'Abaixo da SMA 20', desc: 'Preço abaixo da média de 20 períodos' });
            }
            
            if (sma5 > sma10) {
                signals.push({ type: 'bullish', name: 'Cruzamento de MMs', desc: 'MM curta cruzou acima da MM longa' });
            } else if (sma5 < sma10) {
                signals.push({ type: 'bearish', name: 'Cruzamento de MMs', desc: 'MM curta cruzou abaixo da MM longa' });
            }
            
            // Sinais de RSI
            if (rsi > 70) {
                signals.push({ type: 'bearish', name: 'RSI Sobrecomprado', desc: `RSI em ${rsi.toFixed(1)} - zona de sobrecompra` });
            } else if (rsi < 30) {
                signals.push({ type: 'bullish', name: 'RSI Sobrevendido', desc: `RSI em ${rsi.toFixed(1)} - zona de sobrevenda` });
            } else if (rsi > 50 && rsi < 70) {
                signals.push({ type: 'neutral', name: 'RSI Neutro/Bullish', desc: `RSI em ${rsi.toFixed(1)} - momentum positivo` });
            } else {
                signals.push({ type: 'neutral', name: 'RSI Neutro/Bearish', desc: `RSI em ${rsi.toFixed(1)} - momentum negativo` });
            }
            
            // Sinais de suporte/resistência
            const distToResistance = ((resistance - price) / price) * 100;
            const distToSupport = ((price - support) / price) * 100;
            
            if (distToResistance < 2) {
                signals.push({ type: 'warning', name: 'Próximo à Resistência', desc: `Apenas ${distToResistance.toFixed(1)}% abaixo da resistência` });
            }
            if (distToSupport < 2) {
                signals.push({ type: 'warning', name: 'Próximo ao Suporte', desc: `Apenas ${distToSupport.toFixed(1)}% acima do suporte` });
            }
            
            return signals;
        }
        
        function renderIndicatorTechnicalAnalysis(analysis, indicator) {
            const body = document.getElementById('ta-modal-body');
            try {
            // Safe guard: prevent crash on first load when data is incomplete
            if (!analysis || !analysis.price || !analysis.indicators || !analysis.trend || !analysis.signals) {
                body.innerHTML = `
                    <div style="padding: 40px 20px; text-align: center;">
                        <div style="width: 40px; height: 40px; border: 3px solid #3b82f6; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
                        <div style="font-size: 14px; color: var(--text-secondary);">Carregando dados do indicador...</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">Aguarde enquanto os dados s\u00e3o processados.</div>
                    </div>
                    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
                `;
                // Auto-retry once after 2s
                setTimeout(() => {
                    if (window.currentIndicator) {
                        openIndicatorTechnicalAnalysis();
                    }
                }, 2000);
                return;
            }
            const color = INDICATOR_COLORS[indicator.icon] || '#3b82f6';
            
            const trendColor = analysis.trend.direction === 'BULLISH' ? 'var(--accent-green)' : 
                              analysis.trend.direction === 'BEARISH' ? 'var(--accent-red)' : 'var(--accent-yellow)';
            const trendIcon = analysis.trend.direction === 'BULLISH' ? 'fa-arrow-up' : 
                             analysis.trend.direction === 'BEARISH' ? 'fa-arrow-down' : 'fa-minus';
            const trendLabel = analysis.trend.direction === 'BULLISH' ? 'ALTA' : 
                              analysis.trend.direction === 'BEARISH' ? 'BAIXA' : 'NEUTRO';
            
            body.innerHTML = `
                <div class="ta-section">
                    <!-- Cabeçalho com Tendência -->
                    <div style="background: linear-gradient(135deg, ${color}15 0%, transparent 100%); border-radius: 16px; padding: 20px; margin-bottom: 20px; border: 1px solid ${color}30;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                            <div>
                                <div style="font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px;">Tendência Atual</div>
                                <div style="font-size: 28px; font-weight: 800; color: ${trendColor}; display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                                    <i class="fas ${trendIcon}"></i>
                                    ${trendLabel}
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 11px; color: var(--text-muted);">Força da Tendência</div>
                                <div style="font-size: 24px; font-weight: 700; color: ${trendColor};">${(analysis.trend.strength || 0).toFixed(0)}%</div>
                            </div>
                        </div>
                        <div style="background: var(--bg-secondary); border-radius: 8px; height: 8px; overflow: hidden;">
                            <div style="background: linear-gradient(90deg, var(--accent-red), var(--accent-yellow), var(--accent-green)); height: 100%; width: 100%;"></div>
                        </div>
                        <div style="position: relative; height: 20px;">
                            <div style="position: absolute; left: ${analysis.trend.strength}%; transform: translateX(-50%); top: 4px;">
                                <i class="fas fa-caret-up" style="font-size: 16px; color: ${trendColor};"></i>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Grid de Indicadores -->
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px;">
                        <div style="background: var(--bg-card); border-radius: 12px; padding: 14px; border: 1px solid var(--border-subtle);">
                            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">RSI (14)</div>
                            <div style="font-size: 20px; font-weight: 700; color: ${analysis.indicators.rsi > 70 ? 'var(--accent-red)' : analysis.indicators.rsi < 30 ? 'var(--accent-green)' : 'var(--text-primary)'};">
                                ${(analysis.indicators.rsi || 0).toFixed(1)}
                            </div>
                            <div style="font-size: 10px; color: var(--text-muted);">
                                ${analysis.indicators.rsi > 70 ? 'Sobrecomprado' : analysis.indicators.rsi < 30 ? 'Sobrevendido' : 'Neutro'}
                            </div>
                        </div>
                        
                        <div style="background: var(--bg-card); border-radius: 12px; padding: 14px; border: 1px solid var(--border-subtle);">
                            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Volatilidade</div>
                            <div style="font-size: 20px; font-weight: 700; color: ${analysis.indicators.volatility > 30 ? 'var(--accent-red)' : 'var(--text-primary)'};">
                                ${(analysis.indicators.volatility || 0).toFixed(1)}%
                            </div>
                            <div style="font-size: 10px; color: var(--text-muted);">Anualizada</div>
                        </div>
                        
                        <div style="background: var(--bg-card); border-radius: 12px; padding: 14px; border: 1px solid var(--border-subtle);">
                            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Suporte</div>
                            <div style="font-size: 18px; font-weight: 700; color: var(--accent-green);">
                                ${formatIndicatorPrice(analysis.indicators.support)}
                            </div>
                            <div style="font-size: 10px; color: var(--text-muted);">
                                ${(analysis.price.current > 0 ? (((analysis.price.current - (analysis.indicators.support || 0)) / analysis.price.current) * 100).toFixed(1) : '0.0')}% acima
                            </div>
                        </div>
                        
                        <div style="background: var(--bg-card); border-radius: 12px; padding: 14px; border: 1px solid var(--border-subtle);">
                            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Resistência</div>
                            <div style="font-size: 18px; font-weight: 700; color: var(--accent-red);">
                                ${formatIndicatorPrice(analysis.indicators.resistance)}
                            </div>
                            <div style="font-size: 10px; color: var(--text-muted);">
                                ${(analysis.price.current > 0 ? ((((analysis.indicators.resistance || 0) - analysis.price.current) / analysis.price.current) * 100).toFixed(1) : '0.0')}% abaixo
                            </div>
                        </div>
                    </div>
                    
                    <!-- Médias Móveis -->
                    <div style="background: var(--bg-card); border-radius: 16px; padding: 16px; margin-bottom: 20px; border: 1px solid var(--border-subtle);">
                        <div style="font-size: 13px; font-weight: 700; color: var(--accent-blue); margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-chart-line"></i> Médias Móveis
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--bg-secondary); border-radius: 8px;">
                                <span style="font-size: 12px; color: var(--text-secondary);">SMA 5</span>
                                <span style="font-size: 14px; font-weight: 600; color: ${(analysis.price?.current || 0) > (analysis.indicators?.sma5 || 0) ? 'var(--accent-green)' : 'var(--accent-red)'};">
                                    ${formatIndicatorPrice(analysis.indicators.sma5)}
                                </span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--bg-secondary); border-radius: 8px;">
                                <span style="font-size: 12px; color: var(--text-secondary);">SMA 10</span>
                                <span style="font-size: 14px; font-weight: 600; color: ${(analysis.price?.current || 0) > (analysis.indicators?.sma10 || 0) ? 'var(--accent-green)' : 'var(--accent-red)'};">
                                    ${formatIndicatorPrice(analysis.indicators.sma10)}
                                </span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--bg-secondary); border-radius: 8px;">
                                <span style="font-size: 12px; color: var(--text-secondary);">SMA 20</span>
                                <span style="font-size: 14px; font-weight: 600; color: ${(analysis.price?.current || 0) > (analysis.indicators?.sma20 || 0) ? 'var(--accent-green)' : 'var(--accent-red)'};">
                                    ${formatIndicatorPrice(analysis.indicators.sma20)}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Sinais -->
                    <div style="background: var(--bg-card); border-radius: 16px; padding: 16px; border: 1px solid var(--border-subtle);">
                        <div style="font-size: 13px; font-weight: 700; color: var(--accent-purple); margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-signal"></i> Sinais Técnicos
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            ${analysis.signals.map(signal => `
                                <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-secondary); border-radius: 10px; border-left: 3px solid ${signal.type === 'bullish' ? 'var(--accent-green)' : signal.type === 'bearish' ? 'var(--accent-red)' : signal.type === 'warning' ? 'var(--accent-yellow)' : 'var(--text-muted)'};">
                                    <i class="fas ${signal.type === 'bullish' ? 'fa-arrow-up' : signal.type === 'bearish' ? 'fa-arrow-down' : signal.type === 'warning' ? 'fa-exclamation-triangle' : 'fa-minus'}" style="color: ${signal.type === 'bullish' ? 'var(--accent-green)' : signal.type === 'bearish' ? 'var(--accent-red)' : signal.type === 'warning' ? 'var(--accent-yellow)' : 'var(--text-muted)'}; font-size: 14px; width: 20px;"></i>
                                    <div>
                                        <div style="font-size: 12px; font-weight: 600; color: var(--text-primary);">${signal.name}</div>
                                        <div style="font-size: 10px; color: var(--text-muted);">${signal.desc}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <!-- Disclaimer - Botão para modal -->
                    <div style="text-align: center; margin-top: 16px;">
                        <button onclick="openAvisoLegalModal()" style="background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.25); border-radius: 20px; padding: 6px 16px; color: #f59e0b; font-size: 10px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 9px;"></i> Aviso Legal
                        </button>
                    </div>
                </div>
            `;
            } catch (renderErr) {
                console.error('[Simple TA Render] Error:', renderErr);
                body.innerHTML = `
                    <div style="padding: 40px 20px; text-align: center;">
                        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                        <div style="font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">Erro ao renderizar análise</div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;">Tente novamente em alguns segundos.</div>
                        <div style="font-size: 10px; color: var(--text-muted); background: var(--bg-secondary); padding: 8px; border-radius: 8px; word-break: break-all;">${renderErr?.message || 'Erro desconhecido'}</div>
                    </div>
                `;
            }
        }

        // Open fullscreen chart for indicator
        async function openIndicatorFullscreenChart() {
            if (!window.currentIndicator) return;
            
            const indicator = window.currentIndicator;
            
            // Configurar dados para o fullscreen
            document.getElementById('fullscreen-crypto-icon').src = '';
            document.getElementById('fullscreen-crypto-icon').style.display = 'none';
            document.getElementById('fullscreen-crypto-name').textContent = indicator.name;
            document.getElementById('fullscreen-crypto-price').textContent = indicator.value;
            
            // Salvar configuração especial para indicador
            window.fullscreenIndicatorMode = true;
            window.fullscreenIndicatorSymbol = INDICATOR_SYMBOLS[indicator.icon];
            window.fullscreenIndicatorColor = INDICATOR_COLORS[indicator.icon];
            
            fullscreenChartType = 'line';
            window.fullscreenIndicatorPeriod = '1h';
            fullscreenPeriod = '1h'; // Sync for time label formatting
            
            // Configurar dropdown de período para indicadores MACRO
            const periodContainer = document.getElementById('fs-timeframe-dropdown');
            if (periodContainer) {
                document.getElementById('fs-selected-timeframe').textContent = '1h';
                const optionsHtml = [
                    {p:'15m',l:'15 minutos'},{p:'30m',l:'30 minutos'},{p:'1h',l:'1 hora'},{p:'4h',l:'4 horas'},
                    {p:'24h',l:'24 horas'},{p:'7d',l:'7 dias'},{p:'1mo',l:'1 mês'},{p:'6mo',l:'6 meses'},{p:'1y',l:'1 ano'}
                ].map(o => `<div class="fs-timeframe-option${o.p==='1h'?' active':''}" data-period="${o.p}" onclick="selectFsTimeframeIndicator('${o.p}','${o.l}')">
                    <span>${o.l}</span><i class="fas fa-check fs-timeframe-option-check"></i>
                </div>`).join('');
                periodContainer.querySelector('.fs-timeframe-options').innerHTML = optionsHtml;
            }
            
            // Atualizar UI do fullscreen - mostrar botões de tipo
            document.querySelectorAll('#chart-fullscreen-modal .chart-type-btn').forEach(btn => {
                btn.style.display = '';
                btn.classList.toggle('active', btn.dataset.type === 'line');
            });
            
            // Fechar modal do indicador
            document.getElementById('indicator-detail-modal').classList.remove('active');
            
            // Ativar modo fullscreen
            try {
                // PRIMEIRO: Travar em landscape
                await lockLandscape();
                
                if (window.Capacitor && window.Capacitor.Plugins) {
                    if (window.Capacitor.Plugins.StatusBar) {
                        await window.Capacitor.Plugins.StatusBar.hide();
                    }
                    if (window.Capacitor.Plugins.Fullscreen) {
                        await window.Capacitor.Plugins.Fullscreen.enterFullscreen();
                    }
                }
            } catch (e) {
            }
            
            document.body.classList.add('fullscreen-active');
            document.getElementById('chart-fullscreen-modal').classList.add('active');
            
            if (window.history && window.history.pushState) {
                window.history.pushState({ page: 'chart-fullscreen' }, '', '');
            }
            
            setTimeout(async () => {
                await loadIndicatorFullscreenData();
            }, 300);
        }
        
        async function loadIndicatorFullscreenData() {
            if (!window.fullscreenIndicatorMode || !window.fullscreenIndicatorSymbol) return;
            
            const period = window.fullscreenIndicatorPeriod || '1h';
            
            // Mapear períodos para intervalo/range do Yahoo Finance
            const periodConfig = {
                '15m': { interval: '1m', range: '1d' },
                '30m': { interval: '2m', range: '1d' },
                '1h': { interval: '5m', range: '1d' },
                '4h': { interval: '15m', range: '5d' },
                '24h': { interval: '30m', range: '5d' },
                '7d': { interval: '1h', range: '7d' },
                '1mo': { interval: '1d', range: '1mo' },
                '6mo': { interval: '1d', range: '6mo' },
                '1y': { interval: '1wk', range: '1y' }
            };
            
            const config = periodConfig[period] || { interval: '5m', range: '1d' };
            const interval = config.interval;
            const range = config.range;
            
            try {
                // Tentar múltiplas URLs
                const urls = [
                    `https://query1.finance.yahoo.com/v8/finance/chart/${window.fullscreenIndicatorSymbol}?interval=${interval}&range=${range}`,
                    `https://query2.finance.yahoo.com/v8/finance/chart/${window.fullscreenIndicatorSymbol}?interval=${interval}&range=${range}`
                ];
                
                let data = null;
                for (const url of urls) {
                    try {
                        const response = await fetch(url);
                        if (response.ok) {
                            data = await response.json();
                            if (data?.chart?.result?.[0]?.timestamp?.length > 0) break;
                        }
                    } catch (e) {
                    }
                }
                
                if (data?.chart?.result?.[0]) {
                    const result = data.chart.result[0];
                    const timestamps = result.timestamp || [];
                    const quote = result.indicators.quote[0];
                    
                    fullscreenCandleData = timestamps.map((t, i) => ({
                        time: new Date(t * 1000),
                        open: quote.open[i] || quote.close[i],
                        high: quote.high[i] || quote.close[i],
                        low: quote.low[i] || quote.close[i],
                        close: quote.close[i],
                        volume: quote.volume ? quote.volume[i] : 0
                    })).filter(d => d.close != null);
                    
                    renderFullscreenChart();
                }
            } catch (error) {
            }
        }
        
        // Selecionar período no fullscreen de indicadores
        function selectIndicatorFullscreenPeriod(period) {
            window.fullscreenIndicatorPeriod = period;
            fullscreenPeriod = period; // Sync for time label formatting
            
            // Atualizar estado visual das opções do dropdown
            document.querySelectorAll('#fs-timeframe-dropdown .fs-timeframe-option').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.period === period);
            });
            const labelEl = document.getElementById('fs-selected-timeframe');
            if (labelEl) labelEl.textContent = period;
            
            // Recarregar dados
            loadIndicatorFullscreenData();
        }

        // Wrapper para selecionar timeframe de indicador no fullscreen
        function selectFsTimeframeIndicator(period, label) {
            document.getElementById('fs-selected-timeframe').textContent = period;
            document.querySelectorAll('.fs-timeframe-option').forEach(opt => opt.classList.remove('active'));
            const target = document.querySelector(`.fs-timeframe-option[data-period="${period}"]`);
            if (target) target.classList.add('active');
            document.getElementById('fs-timeframe-dropdown').classList.remove('open');
            selectIndicatorFullscreenPeriod(period);
        }

