        // ============================================
        // CHART MODAL - Gráfico de Preços
        // ============================================
        let currentChartSymbol = null;
        let currentChartPeriod = '15m';
        let currentChartType = 'line';
        let chartInstance = null;
        let candleData = null;
        let chartRefreshInterval = null; // Intervalo para atualização em tempo real

        async function openChartModal(symbol) {
            try {
            currentChartSymbol = symbol;
            const crypto = CRYPTO_DATABASE[symbol];
            if (!crypto) return;
            
            // Atualizar header do modal
            const iconEl = document.getElementById('chart-crypto-icon');
            const nameEl = document.getElementById('chart-crypto-name');
            const priceEl = document.getElementById('chart-crypto-price');
            const modalEl = document.getElementById('chart-modal');
            if (iconEl) iconEl.src = crypto.img;
            if (nameEl) nameEl.textContent = crypto.name;
            
            const price = prices[symbol] || 0;
            const change = priceChanges[symbol] || 0;
            if (priceEl) priceEl.innerHTML = `$${price.toLocaleString(undefined, {minimumFractionDigits: 2})} <span class="${change >= 0 ? 'pnl-positive' : 'pnl-negative'}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</span>`;
            
            // Mostrar modal
            if (modalEl) modalEl.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Reset filtro para 15m (padrão)
            currentChartPeriod = '15m';
            currentChartType = 'line';
            candleData = null; // Limpar dados anteriores
            
            // Reset dropdown para 15 minutos
            const tfEl = document.getElementById('selected-timeframe');
            if (tfEl) tfEl.textContent = '15 minutos';
            document.querySelectorAll('.timeframe-option').forEach(opt => opt.classList.remove('active'));
            const firstOption = document.querySelector('.timeframe-option[data-period="15m"]');
            if (firstOption) firstOption.classList.add('active');
            
            // Reset tipo de gráfico
            document.querySelectorAll('.chart-type-btn').forEach(btn => btn.classList.remove('active'));
            const lineBtn = document.querySelector('.chart-type-btn[data-type="line"]');
            if (lineBtn) lineBtn.classList.add('active');
            
            // Carregar dados
            await loadChartData();
            
            // Iniciar atualização em tempo real
            startChartRealTimeUpdate();
            } catch(e) { console.warn('[openChartModal]', e); }
        }

        function closeChartModal() {
            const el = document.getElementById('chart-modal');
            if (el) el.classList.remove('active');
            document.body.style.overflow = '';
            currentChartSymbol = null;
            candleData = null;
            
            // Parar atualização em tempo real
            if (chartRefreshInterval) {
                clearInterval(chartRefreshInterval);
                chartRefreshInterval = null;
            }
            
            // Destruir gráfico
            if (chartInstance) {
                chartInstance = null;
            }
        }


        async function openFullscreenChart() {
            if (!currentChartSymbol) return;
            
            const crypto = CRYPTO_DATABASE[currentChartSymbol];
            if (!crypto) return;
            
            // Resetar zoom e pan ao abrir
            fsZoom = 1;
            fsPanX = 0;
            
            const price = prices[currentChartSymbol] || 0;
            const priceFormatted = price > 0 ? `$${price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: price < 1 ? 6 : 2})}` : 'Carregando...';
            
            // Atualizar header do fullscreen
            const fsIcon = document.getElementById('fullscreen-crypto-icon');
            const fsName = document.getElementById('fullscreen-crypto-name');
            const fsPrice = document.getElementById('fullscreen-crypto-price');
            if (fsIcon) fsIcon.src = crypto.img;
            if (fsName) fsName.textContent = crypto.short || crypto.name;
            if (fsPrice) fsPrice.textContent = priceFormatted;
            
            // Copiar configurações atuais
            fullscreenChartType = currentChartType || 'line';
            fullscreenPeriod = currentChartPeriod || '15m';
            
            // Atualizar UI do fullscreen
            document.querySelectorAll('#chart-fullscreen-modal .chart-type-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.type === fullscreenChartType);
            });
            
            document.querySelectorAll('.fs-timeframe-option').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.period === fullscreenPeriod);
            });
            const fsLabel = document.getElementById('fs-selected-timeframe');
            if (fsLabel) fsLabel.textContent = fullscreenPeriod;
            
            // Ativar modo imersivo completo no Android (esconder status bar e TRAVAR em landscape)
            try {
                // PRIMEIRO: Travar em landscape usando nossa função helper
                await lockLandscape();
                
                // Usar Capacitor plugins para outros recursos
                if (window.Capacitor && window.Capacitor.Plugins) {
                    // Esconder StatusBar
                    if (window.Capacitor.Plugins.StatusBar) {
                        await window.Capacitor.Plugins.StatusBar.hide();
                    }
                    
                    // Tentar modo fullscreen nativo
                    if (window.Capacitor.Plugins.Fullscreen) {
                        await window.Capacitor.Plugins.Fullscreen.enterFullscreen();
                    }
                }
                
                // Fallback: usar API de Fullscreen do navegador
                const docEl = document.documentElement;
                if (docEl.requestFullscreen) {
                    await docEl.requestFullscreen();
                } else if (docEl.webkitRequestFullscreen) {
                    await docEl.webkitRequestFullscreen();
                } else if (docEl.mozRequestFullScreen) {
                    await docEl.mozRequestFullScreen();
                } else if (docEl.msRequestFullscreen) {
                    await docEl.msRequestFullscreen();
                }
            } catch (e) {
            }
            
            // Adicionar classe ao body para ocultar outros elementos
            document.body.classList.add('fullscreen-active');
            
            // Mostrar modal fullscreen
            const fsModal = document.getElementById('chart-fullscreen-modal');
            if (fsModal) fsModal.classList.add('active');
            
            // Adicionar ao histórico para suportar botão voltar
            if (window.history && window.history.pushState) {
                window.history.pushState({ page: 'chart-fullscreen' }, '', '');
            }
            
            // Carregar dados e renderizar após delay para o layout estar pronto
            setTimeout(async () => {
                await loadFullscreenChartData();
                startFullscreenRealTimeUpdate();
            }, 300);
        }

        async function closeFullscreenChart() {
            // Parar atualização em tempo real primeiro
            if (fullscreenRefreshInterval) {
                clearInterval(fullscreenRefreshInterval);
                fullscreenRefreshInterval = null;
            }
            
            // Resetar modo indicador
            const wasIndicatorMode = window.fullscreenIndicatorMode;
            window.fullscreenIndicatorMode = false;
            window.fullscreenIndicatorSymbol = null;
            window.fullscreenIndicatorColor = null;
            window.fullscreenIndicatorPeriod = null;
            
            // Restaurar visibilidade do ícone
            const fsIconEl = document.getElementById('fullscreen-crypto-icon');
            if (fsIconEl) fsIconEl.style.display = '';
            
            // Restaurar dropdown de período original (para cryptos)
            const periodContainer = document.getElementById('fs-timeframe-dropdown');
            if (periodContainer) {
                document.getElementById('fs-selected-timeframe').textContent = '15m';
                const optionsHtml = [
                    {p:'1m',l:'1 minuto'},{p:'5m',l:'5 minutos'},{p:'15m',l:'15 minutos'},{p:'30m',l:'30 minutos'},
                    {p:'1h',l:'1 hora'},{p:'4h',l:'4 horas'},{p:'24h',l:'24 horas'},{p:'7d',l:'7 dias'},{p:'30d',l:'30 dias'}
                ].map(o => `<div class="fs-timeframe-option${o.p==='15m'?' active':''}" data-period="${o.p}" onclick="selectFsTimeframe('${o.p}','${o.p}')">
                    <span>${o.l}</span><i class="fas fa-check fs-timeframe-option-check"></i>
                </div>`).join('');
                periodContainer.querySelector('.fs-timeframe-options').innerHTML = optionsHtml;
            }
            
            // Restaurar modo normal no Android (mostrar status bar e TRAVAR em portrait)
            try {
                // PRIMEIRO: Travar em portrait usando nossa função helper
                await lockPortrait();
                
                // Usar Capacitor plugins para outros recursos
                if (window.Capacitor && window.Capacitor.Plugins) {
                    // Sair do modo fullscreen nativo
                    if (window.Capacitor.Plugins.Fullscreen) {
                        await window.Capacitor.Plugins.Fullscreen.exitFullscreen();
                    }
                    
                    // Mostrar StatusBar
                    if (window.Capacitor.Plugins.StatusBar) {
                        await window.Capacitor.Plugins.StatusBar.show();
                    }
                }
                
                // Fallback: sair do fullscreen do navegador
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    await document.webkitExitFullscreen();
                } else if (document.mozCancelFullScreen) {
                    await document.mozCancelFullScreen();
                } else if (document.msExitFullscreen) {
                    await document.msExitFullscreen();
                }
            } catch (e) {
            }
            
            // Pequeno delay para a rotação completar antes de esconder o modal
            await new Promise(resolve => setTimeout(resolve, 150));
            
            const cfm = document.getElementById('chart-fullscreen-modal');
            if (cfm) cfm.classList.remove('active');
            document.body.classList.remove('fullscreen-active');
            
            if (fullscreenChartInstance) {
                fullscreenChartInstance.destroy();
                fullscreenChartInstance = null;
            }
        }

        function startFullscreenRealTimeUpdate() {
            // Parar intervalo anterior se existir
            if (fullscreenRefreshInterval) {
                clearInterval(fullscreenRefreshInterval);
            }
            
            // Atualizar a cada 3 segundos
            fullscreenRefreshInterval = setInterval(async () => {
                try {
                const el = document.getElementById('chart-fullscreen-modal');
                if (el && el.classList.contains('active')) {
                    await loadFullscreenChartDataSilent();
                    
                    // Atualizar preço no header
                    const price = prices[currentChartSymbol] || 0;
                    const change = priceChanges[currentChartSymbol] || 0;
                    if (price > 0) {
                        const priceFormatted = `$${price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: price < 1 ? 6 : 2})}`;
                        const priceEl = document.getElementById('fullscreen-crypto-price');
                        if (priceEl) {
                            priceEl.textContent = priceFormatted;
                            priceEl.className = `chart-fullscreen-price ${change >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
                        }
                    }
                }
                } catch(e) {}
            }, 3000);
        }

        async function loadFullscreenChartDataSilent() {
            if (!currentChartSymbol) return;
            
            // O símbolo já está no formato correto (BTCUSDT, ETHUSDT, etc.)
            const symbol = currentChartSymbol;
            const intervalMap = {
                '1m': '1m', '5m': '5m', '30m': '30m', '1h': '1h',
                '4h': '4h', '24h': '1d', '7d': '1d', '30d': '1d'
            };
            const limitMap = {
                '1m': 300, '5m': 300, '30m': 200, '1h': 200,
                '4h': 200, '24h': 150, '7d': 200, '30d': 500
            };
            
            const interval = intervalMap[fullscreenPeriod] || '1m';
            const limit = limitMap[fullscreenPeriod] || 300;
            
            try {
                const response = await fetchWithTimeout(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, {}, 5000);
                const data = await response.json();
                
                if (data && Array.isArray(data) && data.length > 0) {
                    fullscreenCandleData = data.map(k => ({
                        time: new Date(k[0]),
                        open: parseFloat(k[1]),
                        high: parseFloat(k[2]),
                        low: parseFloat(k[3]),
                        close: parseFloat(k[4]),
                        volume: parseFloat(k[5])
                    }));
                    renderFullscreenChart();
                }
            } catch (error) {
                // Silenciar erros em updates automáticos
            }
        }

        function changeFullscreenChartType(type) {
            fullscreenChartType = type;
            
            document.querySelectorAll('#chart-fullscreen-modal .chart-type-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.type === type);
            });
            
            renderFullscreenChart();
        }

        async function selectFullscreenPeriod(period) {
            fullscreenPeriod = period;
            
            document.querySelectorAll('.fs-timeframe-option').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.period === period);
            });
            const labelEl = document.getElementById('fs-selected-timeframe');
            if (labelEl) labelEl.textContent = period;
            
            // Mostrar loading spinner
            const fsLoading = document.getElementById('fs-crypto-loading');
            if (fsLoading) { fsLoading.style.opacity = '1'; fsLoading.style.display = 'flex'; }
            
            // Recarregar dados - verificar se é modo indicador ou crypto
            if (window.fullscreenIndicatorMode) {
                await loadIndicatorFullscreenData();
            } else {
                await loadFullscreenChartData();
            }
        }

        async function loadFullscreenChartData() {
            if (!currentChartSymbol) return;
            
            const fsLoading = document.getElementById('fs-crypto-loading');
            if (fsLoading) { fsLoading.style.opacity = '1'; fsLoading.style.display = 'flex'; }
            
            // O símbolo já está no formato correto (BTCUSDT, ETHUSDT, etc.)
            const symbol = currentChartSymbol;
            const intervalMap = {
                '1m': '1m', '5m': '5m', '30m': '30m', '1h': '1h',
                '4h': '4h', '24h': '1d', '7d': '1d', '30d': '1d'
            };
            const limitMap = {
                '1m': 300, '5m': 300, '30m': 200, '1h': 200,
                '4h': 200, '24h': 150, '7d': 200, '30d': 500
            };
            
            const interval = intervalMap[fullscreenPeriod] || '1m';
            const limit = limitMap[fullscreenPeriod] || 300;
            try {
                const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
                const data = await response.json();
                if (data && Array.isArray(data) && data.length > 0) {
                    fullscreenCandleData = data.map(k => ({
                        time: new Date(k[0]),
                        open: parseFloat(k[1]),
                        high: parseFloat(k[2]),
                        low: parseFloat(k[3]),
                        close: parseFloat(k[4]),
                        volume: parseFloat(k[5])
                    }));
                    renderFullscreenChart();
                } else {
                    renderFullscreenChart();
                }
            } catch (error) {
                renderFullscreenChart();
            }
            const _fsLoading = document.getElementById('fs-crypto-loading');
            if (_fsLoading) { _fsLoading.style.opacity = '0'; setTimeout(() => { if (_fsLoading) _fsLoading.style.display = 'none'; }, 300); }
        }

        // Variáveis para zoom e pan
        let fsZoom = 1;
        let fsPanX = 0;
        let fsIsDragging = false;
        let fsLastX = 0;
        let fsPinchStartDist = 0;
        let fsPinchStartZoom = 1;

        function renderFullscreenChart() {
            const canvas = document.getElementById('fullscreen-chart-canvas');
            const container = document.getElementById('fullscreen-scroll-container');
            if (!canvas || !container) {
                return;
            }
            
            if (!fullscreenCandleData || fullscreenCandleData.length === 0) {
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#0a0a0f';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#888';
                ctx.font = '16px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Carregando dados...', canvas.width / 2, canvas.height / 2);
                return;
            }
            
            // Usar dimensões reais do container
            const containerRect = container.getBoundingClientRect();
            const chartWidth = containerRect.width || window.innerWidth;
            const chartHeight = containerRect.height || (window.innerHeight - 100);
            
            if (chartWidth <= 0 || chartHeight <= 0) {
                return;
            }
            
            const dpr = window.devicePixelRatio || 1;
            canvas.width = chartWidth * dpr;
            canvas.height = chartHeight * dpr;
            canvas.style.width = chartWidth + 'px';
            canvas.style.height = chartHeight + 'px';
            
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            ctx.fillStyle = '#0a0a0f';
            ctx.fillRect(0, 0, chartWidth, chartHeight);
            
            // Aplicar zoom e pan
            const visibleCount = Math.floor(fullscreenCandleData.length / fsZoom);
            const startIdx = Math.max(0, Math.min(
                fullscreenCandleData.length - visibleCount,
                Math.floor(fsPanX / (chartWidth / fullscreenCandleData.length))
            ));
            const endIdx = Math.min(fullscreenCandleData.length, startIdx + visibleCount);
            const visibleData = fullscreenCandleData.slice(startIdx, endIdx);
            
            if (visibleData.length === 0) {
                ctx.fillStyle = '#888';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Sem dados disponíveis', chartWidth / 2, chartHeight / 2);
                return;
            }
            
            // Calcular range de preços
            const prices = visibleData.map(d => [d.high, d.low]).flat().filter(p => !isNaN(p) && p > 0);
            if (prices.length === 0) return;
            
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const priceRange = (maxPrice - minPrice) || maxPrice * 0.01;
            const paddedMin = minPrice - priceRange * 0.05;
            const paddedMax = maxPrice + priceRange * 0.05;
            const paddedRange = paddedMax - paddedMin;
            
            const padding = { top: 15, right: 65, bottom: 35, left: 10 };
            const graphWidth = chartWidth - padding.left - padding.right;
            const graphHeight = chartHeight - padding.top - padding.bottom;
            
            const isPositive = visibleData[visibleData.length - 1].close >= visibleData[0].close;
            // Usar cor do indicador se estiver em modo indicador
            const chartColor = window.fullscreenIndicatorColor || (isPositive ? '#22c55e' : '#ef4444');
            
            // Grid horizontal
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 5; i++) {
                const y = padding.top + (graphHeight * i / 5);
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(chartWidth - padding.right, y);
                ctx.stroke();
            }
            
            // Grid vertical
            const timeGridCount = Math.min(8, visibleData.length);
            const timeGridSpacing = Math.floor(visibleData.length / timeGridCount);
            for (let i = 0; i < visibleData.length; i += Math.max(1, timeGridSpacing)) {
                const x = padding.left + (i / Math.max(1, visibleData.length - 1)) * graphWidth;
                ctx.beginPath();
                ctx.moveTo(x, padding.top);
                ctx.lineTo(x, padding.top + graphHeight);
                ctx.stroke();
            }
            
            if (fullscreenChartType === 'candle') {
                const spacing = graphWidth / visibleData.length;
                const candleWidth = Math.max(2, Math.min(12, spacing * 0.7));
                
                visibleData.forEach((candle, i) => {
                    if (isNaN(candle.open) || isNaN(candle.close)) return;
                    
                    const x = padding.left + (i * spacing) + spacing / 2;
                    const isGreen = candle.close >= candle.open;
                    const color = isGreen ? '#22c55e' : '#ef4444';
                    
                    // Wick
                    const highY = padding.top + ((paddedMax - candle.high) / paddedRange) * graphHeight;
                    const lowY = padding.top + ((paddedMax - candle.low) / paddedRange) * graphHeight;
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(x, highY);
                    ctx.lineTo(x, lowY);
                    ctx.stroke();
                    
                    // Body
                    const openY = padding.top + ((paddedMax - candle.open) / paddedRange) * graphHeight;
                    const closeY = padding.top + ((paddedMax - candle.close) / paddedRange) * graphHeight;
                    ctx.fillStyle = color;
                    ctx.fillRect(x - candleWidth / 2, Math.min(openY, closeY), candleWidth, Math.max(Math.abs(closeY - openY), 1));
                });
            } else {
                // Line chart
                ctx.beginPath();
                ctx.strokeStyle = chartColor;
                ctx.lineWidth = 2.5;
                
                let firstPoint = true;
                visibleData.forEach((d, i) => {
                    if (isNaN(d.close)) return;
                    const x = padding.left + (i / Math.max(1, visibleData.length - 1)) * graphWidth;
                    const y = padding.top + ((paddedMax - d.close) / paddedRange) * graphHeight;
                    if (firstPoint) {
                        ctx.moveTo(x, y);
                        firstPoint = false;
                    } else {
                        ctx.lineTo(x, y);
                    }
                });
                ctx.stroke();
                
                // Gradient fill
                const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + graphHeight);
                gradient.addColorStop(0, isPositive ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)');
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                
                ctx.lineTo(padding.left + graphWidth, padding.top + graphHeight);
                ctx.lineTo(padding.left, padding.top + graphHeight);
                ctx.closePath();
                ctx.fillStyle = gradient;
                ctx.fill();
            }
            
            // Price labels (right side)
            ctx.fillStyle = '#aaa';
            ctx.font = '9px -apple-system, sans-serif';
            ctx.textAlign = 'right';
            
            // Determine if indicator mode (no $ prefix for non-dollar indicators)
            const isDollarAsset = !window.fullscreenIndicatorMode || 
                (window.fullscreenIndicatorSymbol && (
                    window.fullscreenIndicatorSymbol.includes('=F') || // Futures like GC=F, CL=F
                    window.fullscreenIndicatorSymbol === '^GSPC' ||    // S&P 500
                    window.fullscreenIndicatorSymbol === '^DJI'        // Dow Jones
                ));
            
            for (let i = 0; i <= 5; i++) {
                const price = paddedMax - (paddedRange * i / 5);
                const y = padding.top + (graphHeight * i / 5);
                let formatted;
                if (isDollarAsset) {
                    formatted = price >= 1000 ? `$${(price/1000).toFixed(1)}k` : `$${price.toFixed(price < 1 ? 4 : 2)}`;
                } else {
                    formatted = price >= 10000 ? price.toFixed(0) : price >= 100 ? price.toFixed(1) : price.toFixed(2);
                }
                ctx.fillText(formatted, chartWidth - 15, y + 3);
            }
            
            // Time labels at bottom - format based on period
            ctx.fillStyle = '#666';
            ctx.font = '8px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            
            for (let i = 0; i < visibleData.length; i += Math.max(1, timeGridSpacing)) {
                const x = padding.left + (i / Math.max(1, visibleData.length - 1)) * graphWidth;
                const time = visibleData[i].time;
                let label;
                
                // Format based on the selected period
                if (fullscreenPeriod === '1m' || fullscreenPeriod === '5m' || fullscreenPeriod === '15m' || fullscreenPeriod === '1h') {
                    label = time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                } else if (fullscreenPeriod === '4h' || fullscreenPeriod === '1d' || fullscreenPeriod === '24h') {
                    label = time.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                } else if (fullscreenPeriod === '7d' || fullscreenPeriod === '30d' || fullscreenPeriod === '1mo') {
                    label = time.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                } else if (fullscreenPeriod === '6mo' || fullscreenPeriod === '1y' || fullscreenPeriod === 'max') {
                    label = time.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
                } else {
                    label = time.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                }
                
                ctx.fillText(label, x, chartHeight - 20);
            }
            
            // Current price line
            const lastPrice = visibleData[visibleData.length - 1].close;
            const lastY = padding.top + ((paddedMax - lastPrice) / paddedRange) * graphHeight;
            ctx.strokeStyle = chartColor;
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padding.left, lastY);
            ctx.lineTo(chartWidth - padding.right, lastY);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Current price badge
            ctx.fillStyle = chartColor;
            ctx.fillRect(chartWidth - padding.right, lastY - 8, padding.right - 3, 16);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 8px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            let priceLabel;
            if (isDollarAsset) {
                priceLabel = lastPrice >= 1000 ? `$${(lastPrice/1000).toFixed(1)}k` : `$${lastPrice.toFixed(lastPrice < 1 ? 3 : 2)}`;
            } else {
                priceLabel = lastPrice >= 10000 ? lastPrice.toFixed(0) : lastPrice >= 100 ? lastPrice.toFixed(1) : lastPrice.toFixed(2);
            }
            ctx.fillText(priceLabel, chartWidth - padding.right/2 - 1, lastY + 3);
            
            // Zoom indicator
            if (fsZoom > 1) {
                ctx.fillStyle = 'rgba(99, 102, 241, 0.8)';
                ctx.fillRect(10, 10, 60, 24);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`${fsZoom.toFixed(1)}x`, 40, 26);
            }
        }

        // Touch events para zoom e pan no gráfico fullscreen
        document.addEventListener('DOMContentLoaded', function() {
            const canvas = document.getElementById('fullscreen-chart-canvas');
            if (!canvas) return;
            
            // Touch start
            canvas.addEventListener('touchstart', function(e) {
                if (e.touches.length === 1) {
                    fsIsDragging = true;
                    fsLastX = e.touches[0].clientX;
                } else if (e.touches.length === 2) {
                    // Pinch zoom start
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    fsPinchStartDist = Math.sqrt(dx * dx + dy * dy);
                    fsPinchStartZoom = fsZoom;
                }
                e.preventDefault();
            }, { passive: false });
            
            // Touch move
            canvas.addEventListener('touchmove', function(e) {
                if (e.touches.length === 1 && fsIsDragging) {
                    const deltaX = e.touches[0].clientX - fsLastX;
                    fsPanX = Math.max(0, fsPanX - deltaX * fsZoom);
                    fsLastX = e.touches[0].clientX;
                    renderFullscreenChart();
                } else if (e.touches.length === 2) {
                    // Pinch zoom
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const scale = dist / fsPinchStartDist;
                    fsZoom = Math.max(1, Math.min(10, fsPinchStartZoom * scale));
                    renderFullscreenChart();
                }
                e.preventDefault();
            }, { passive: false });
            
            // Touch end
            let isPinching = false;
            canvas.addEventListener('touchend', function(e) {
                if (e.touches.length === 0) {
                    // Todos os dedos levantados
                    setTimeout(() => {
                        fsIsDragging = false;
                        isPinching = false;
                    }, 50);
                } else if (e.touches.length === 1) {
                    // Um dedo ainda tocando após pinch
                    isPinching = false;
                }
            });
            
            // Marcar quando está fazendo pinch
            canvas.addEventListener('touchstart', function(e) {
                if (e.touches.length === 2) {
                    isPinching = true;
                }
            }, { passive: true });
            
            // Double tap to reset zoom (apenas se não estava fazendo pinch)
            let lastTap = 0;
            let tapCount = 0;
            canvas.addEventListener('touchend', function(e) {
                // Ignorar se estava fazendo pinch ou se ainda há dedos na tela
                if (isPinching || e.touches.length > 0) return;
                
                const now = Date.now();
                if (now - lastTap < 300) {
                    tapCount++;
                    if (tapCount === 2) {
                        fsZoom = 1;
                        fsPanX = 0;
                        renderFullscreenChart();
                        tapCount = 0;
                    }
                } else {
                    tapCount = 1;
                }
                lastTap = now;
            });
        });

        // Handle back button in fullscreen
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' || e.key === 'Backspace') {
                if (document.getElementById('chart-fullscreen-modal').classList.contains('active')) {
                    closeFullscreenChart();
                    e.preventDefault();
                }
            }
        });
        
        // Função para iniciar atualização em tempo real do gráfico
        function startChartRealTimeUpdate() {
            // Parar intervalo anterior se existir
            if (chartRefreshInterval) {
                clearInterval(chartRefreshInterval);
            }
            
            // Todos os timeframes atualizam a cada 2 segundos
            const refreshRate = 2000; // 2 segundos para todos
            
            chartRefreshInterval = setInterval(async () => {
                try {
                const el = document.getElementById('chart-modal');
                if (currentChartSymbol && el && el.classList.contains('active')) {
                    await loadChartDataSilent(); // Atualização silenciosa sem loading
                }
                } catch(e) {}
            }, refreshRate);
        }
        
        // Funções do dropdown de timeframes
        function toggleTimeframeDropdown() {
            const dropdown = document.getElementById('timeframe-dropdown');
            if (dropdown) dropdown.classList.toggle('open');
        }
        
        function selectTimeframe(period, label) {
            // Atualizar texto selecionado
            const stEl = document.getElementById('selected-timeframe');
            if (stEl) stEl.textContent = label;
            
            // Atualizar classe active nas opções
            document.querySelectorAll('.timeframe-option').forEach(opt => opt.classList.remove('active'));
            const target = document.querySelector(`.timeframe-option[data-period="${period}"]`);
            if (target) target.classList.add('active');
            
            // Fechar dropdown
            const dd = document.getElementById('timeframe-dropdown');
            if (dd) dd.classList.remove('open');
            
            // Mudar período
            changeChartPeriod(period);
        }
        
        // Fechar dropdown ao clicar fora
        document.addEventListener('click', function(e) {
            const dropdown = document.getElementById('timeframe-dropdown');
            if (dropdown && !dropdown.contains(e.target)) {
                dropdown.classList.remove('open');
            }
            const fsDropdown = document.getElementById('fs-timeframe-dropdown');
            if (fsDropdown && !fsDropdown.contains(e.target)) {
                fsDropdown.classList.remove('open');
            }
            const indDropdown = document.getElementById('ind-timeframe-dropdown');
            if (indDropdown && !indDropdown.contains(e.target)) {
                indDropdown.classList.remove('open');
            }
        });

        // Fullscreen timeframe dropdown
        function toggleFsTimeframeDropdown() {
            const dropdown = document.getElementById('fs-timeframe-dropdown');
            if (dropdown) dropdown.classList.toggle('open');
        }

        function selectFsTimeframe(period, label) {
            const fsSel = document.getElementById('fs-selected-timeframe');
            if (fsSel) fsSel.textContent = label;
            document.querySelectorAll('.fs-timeframe-option').forEach(opt => opt.classList.remove('active'));
            const target = document.querySelector(`.fs-timeframe-option[data-period="${period}"]`);
            if (target) target.classList.add('active');
            const fsDd = document.getElementById('fs-timeframe-dropdown');
            if (fsDd) fsDd.classList.remove('open');
            selectFullscreenPeriod(period);
        }

        // Indicator timeframe dropdown
        function toggleIndTimeframeDropdown() {
            const dropdown = document.getElementById('ind-timeframe-dropdown');
            if (dropdown) dropdown.classList.toggle('open');
        }

        function selectIndTimeframe(period, label) {
            const indSel = document.getElementById('ind-selected-timeframe');
            if (indSel) indSel.textContent = label;
            document.querySelectorAll('.ind-timeframe-option').forEach(opt => opt.classList.remove('active'));
            const target = document.querySelector(`.ind-timeframe-option[data-period="${period}"]`);
            if (target) target.classList.add('active');
            document.getElementById('ind-timeframe-dropdown')?.classList.remove('open');
            selectIndicatorPeriod(period);
        }

        async function changeChartPeriod(period) {
            currentChartPeriod = period;
            
            // Atualizar dropdown (se existir)
            const periodBtn = document.querySelector(`.chart-period-btn[data-period="${period}"]`);
            if (periodBtn) {
                document.querySelectorAll('.chart-period-btn').forEach(btn => btn.classList.remove('active'));
                periodBtn.classList.add('active');
            }
            
            // Recarregar gráfico
            candleData = null; // Forçar reload com loading
            await loadChartData();
            
            // Reiniciar atualização em tempo real
            startChartRealTimeUpdate();
        }

        function changeChartType(type) {
            currentChartType = type;
            
            // Atualizar botões
            document.querySelectorAll('.chart-type-btn').forEach(btn => btn.classList.remove('active'));
            const activeBtn = document.querySelector(`.chart-type-btn[data-type="${type}"]`);
            if (activeBtn) activeBtn.classList.add('active');
            
            // Redesenhar com dados existentes
            if (candleData) {
                if (type === 'candle') {
                    drawCandleChart(candleData);
                } else {
                    const prices = candleData.map(k => [k[0], k[4]]);
                    drawChart(prices, null);
                }
            }
        }

        // Função de carregamento silencioso (sem loading) para atualizações em tempo real
        async function loadChartDataSilent() {
            if (!currentChartSymbol) return;
            
            try {
                const periodMap = {
                    '1m': { interval: '1m', limit: 120 },
                    '5m': { interval: '5m', limit: 100 },
                    '30m': { interval: '30m', limit: 100 },
                    '1h': { interval: '1h', limit: 100 },
                    '4h': { interval: '4h', limit: 100 },
                    '24h': { interval: '1d', limit: 30 },
                    '7d': { interval: '4h', limit: 42 },
                    '30d': { interval: '1d', limit: 30 }
                };
                
                const config = periodMap[currentChartPeriod] || periodMap['1m'];
                
                // Timeout de 3 segundos para atualização rápida
                const binanceRes = await fetchWithTimeout(`https://api.binance.com/api/v3/klines?symbol=${currentChartSymbol}&interval=${config.interval}&limit=${config.limit}`, {}, 3000);
                const klines = await binanceRes.json();
                
                if (klines && klines.length > 0) {
                    candleData = klines.map(k => [
                        k[0], parseFloat(k[1]), parseFloat(k[2]), parseFloat(k[3]), parseFloat(k[4]), parseFloat(k[5])
                    ]);
                    
                    if (currentChartType === 'candle') {
                        drawCandleChart(candleData);
                    } else {
                        const prices = candleData.map(k => [k[0], k[4]]);
                        drawChart(prices, null);
                    }
                    updateChartStats(candleData.map(k => [k[0], k[4]]));
                }
            } catch (e) {
                // Silenciar erros nas atualizações automáticas
            }
        }
        
        async function loadChartData() {
            if (!currentChartSymbol) return;
            
            const loadingEl = document.getElementById('chart-loading');
            const canvas = document.getElementById('price-chart');
            if (!loadingEl || !canvas) return;
            
            // SEMPRE mostrar loading ao trocar timeframe - limpar gráfico anterior
            loadingEl.style.display = 'flex';
            canvas.style.opacity = '0.3';
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            try {
                // Mapear período para intervalo Binance
                const periodMap = {
                    '1m': { interval: '1m', limit: 120 },
                    '5m': { interval: '5m', limit: 100 },
                    '30m': { interval: '30m', limit: 100 },
                    '1h': { interval: '1h', limit: 100 },
                    '4h': { interval: '4h', limit: 100 },
                    '24h': { interval: '1d', limit: 30 },
                    '7d': { interval: '4h', limit: 42 },   // 7 dias x 6 candles de 4h por dia
                    '30d': { interval: '1d', limit: 30 }   // 30 dias
                };
                
                const config = periodMap[currentChartPeriod] || periodMap['1m'];
                
                // Timeout de 3 segundos para carregamento rápido
                const binanceRes = await fetchWithTimeout(`https://api.binance.com/api/v3/klines?symbol=${currentChartSymbol}&interval=${config.interval}&limit=${config.limit}`, {}, 3000);
                const klines = await binanceRes.json();
                
                if (klines && klines.length > 0) {
                    // Guardar dados para alternar entre tipos
                    candleData = klines.map(k => [
                        k[0],                    // timestamp
                        parseFloat(k[1]),        // open
                        parseFloat(k[2]),        // high
                        parseFloat(k[3]),        // low
                        parseFloat(k[4]),        // close
                        parseFloat(k[5])         // volume
                    ]);
                    
                    if (currentChartType === 'candle') {
                        drawCandleChart(candleData);
                    } else {
                        const prices = candleData.map(k => [k[0], k[4]]);
                        drawChart(prices, null);
                    }
                    updateChartStats(candleData.map(k => [k[0], k[4]]));
                }
            } catch (e) {
            }
            
            loadingEl.style.display = 'none';
            canvas.style.opacity = '1';
        }

        function drawCandleChart(candleData) {
            const canvas = document.getElementById('price-chart');
            const ctx = canvas.getContext('2d');
            
            // Ajustar canvas para DPI da tela
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
            
            const width = rect.width;
            const height = rect.height;
            const padding = { top: 20, right: 10, bottom: 40, left: 60 };
            
            // Limpar canvas
            ctx.clearRect(0, 0, width, height);
            
            // Encontrar min/max
            let minPrice = Infinity, maxPrice = -Infinity;
            candleData.forEach(c => {
                minPrice = Math.min(minPrice, c[3]); // low
                maxPrice = Math.max(maxPrice, c[2]); // high
            });
            const priceRange = maxPrice - minPrice || 1;
            
            // Área do gráfico
            const chartWidth = width - padding.left - padding.right;
            const chartHeight = height - padding.top - padding.bottom;
            
            // Desenhar linhas de grade horizontais
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const y = padding.top + (chartHeight / 4) * i;
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.stroke();
                
                // Labels de preço
                const price = maxPrice - (priceRange / 4) * i;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.font = '10px Inter';
                ctx.textAlign = 'right';
                ctx.fillText(formatChartPrice(price), padding.left - 8, y + 4);
            }
            
            // Labels de tempo no eixo X
            {
                const totalCandles = candleData.length;
                const labelCount = Math.min(5, totalCandles);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.font = '9px Inter';
                ctx.textAlign = 'center';
                for (let li = 0; li < labelCount; li++) {
                    const idx = Math.round(li * (totalCandles - 1) / (labelCount - 1));
                    const ts = candleData[idx][0];
                    const d = new Date(ts);
                    const period = currentChartPeriod || '1h';
                    let label;
                    if (['1d','1w','1M'].includes(period)) {
                        label = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
                    } else {
                        label = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                    }
                    const lx = padding.left + (idx / (totalCandles - 1)) * chartWidth;
                    ctx.fillText(label, lx, height - padding.bottom + 14);
                }
            }

            // Calcular largura das velas
            const candleWidth = Math.max(2, (chartWidth / candleData.length) * 0.7);
            const candleSpacing = chartWidth / candleData.length;
            
            // Desenhar velas
            candleData.forEach((candle, i) => {
                const [timestamp, open, high, low, close] = candle;
                const isGreen = close >= open;
                const color = isGreen ? '#22c55e' : '#ef4444';
                
                const x = padding.left + i * candleSpacing + candleSpacing / 2;
                const openY = padding.top + (1 - (open - minPrice) / priceRange) * chartHeight;
                const closeY = padding.top + (1 - (close - minPrice) / priceRange) * chartHeight;
                const highY = padding.top + (1 - (high - minPrice) / priceRange) * chartHeight;
                const lowY = padding.top + (1 - (low - minPrice) / priceRange) * chartHeight;
                
                // Desenhar pavio
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, highY);
                ctx.lineTo(x, lowY);
                ctx.stroke();
                
                // Desenhar corpo
                const bodyTop = Math.min(openY, closeY);
                const bodyHeight = Math.abs(closeY - openY) || 1;
                
                ctx.fillStyle = color;
                ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
            });
        }

        function drawChart(priceData, volumeData) {
            const canvas = document.getElementById('price-chart');
            const ctx = canvas.getContext('2d');
            
            // Ajustar canvas para DPI da tela
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
            
            const width = rect.width;
            const height = rect.height;
            const padding = { top: 20, right: 10, bottom: 40, left: 60 };
            
            // Limpar canvas
            ctx.clearRect(0, 0, width, height);
            
            // Extrair preços
            const prices = priceData.map(p => p[1]);
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const priceRange = maxPrice - minPrice || 1;
            
            // Área do gráfico
            const chartWidth = width - padding.left - padding.right;
            const chartHeight = height - padding.top - padding.bottom;
            
            // Determinar cor baseado em tendência
            const isUp = prices[prices.length - 1] >= prices[0];
            const lineColor = isUp ? '#22c55e' : '#ef4444';
            const gradientColor = isUp ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';
            
            // Desenhar linhas de grade horizontais
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const y = padding.top + (chartHeight / 4) * i;
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.stroke();
                
                // Labels de preço
                const price = maxPrice - (priceRange / 4) * i;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.font = '10px Inter';
                ctx.textAlign = 'right';
                ctx.fillText(formatChartPrice(price), padding.left - 8, y + 4);
            }
            
            // Labels de tempo no eixo X
            {
                const totalPoints = priceData.length;
                const labelCount = Math.min(5, totalPoints);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.font = '9px Inter';
                ctx.textAlign = 'center';
                for (let li = 0; li < labelCount; li++) {
                    const idx = Math.round(li * (totalPoints - 1) / (labelCount - 1));
                    const ts = priceData[idx][0];
                    const d = new Date(ts);
                    const period = currentChartPeriod || '1h';
                    let label;
                    if (['1d','1w','1M'].includes(period)) {
                        label = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
                    } else {
                        label = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                    }
                    const lx = padding.left + (idx / (totalPoints - 1)) * chartWidth;
                    ctx.fillText(label, lx, height - padding.bottom + 14);
                }
            }

            // Calcular pontos
            const points = prices.map((price, i) => ({
                x: padding.left + (i / (prices.length - 1)) * chartWidth,
                y: padding.top + (1 - (price - minPrice) / priceRange) * chartHeight
            }));
            
            // Desenhar área preenchida
            ctx.beginPath();
            ctx.moveTo(points[0].x, height - padding.bottom);
            points.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
            ctx.closePath();
            
            const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
            gradient.addColorStop(0, gradientColor);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.fill();
            
            // Desenhar linha
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            points.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
            
            // Ponto final com glow
            const lastPoint = points[points.length - 1];
            ctx.beginPath();
            ctx.arc(lastPoint.x, lastPoint.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = lineColor;
            ctx.fill();
            ctx.shadowColor = lineColor;
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(lastPoint.x, lastPoint.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = 'white';
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        function formatChartPrice(price) {
            if (price >= 1000) return `$${(price/1000).toFixed(1)}k`;
            if (price >= 1) return `$${price.toFixed(2)}`;
            if (price >= 0.01) return `$${price.toFixed(4)}`;
            return `$${price.toFixed(8)}`;
        }

        function updateChartStats(priceData) {
            if (!priceData || priceData.length === 0) return;
            const prices = priceData.map(p => p[1]);
            const firstPrice = prices[0];
            const lastPrice = prices[prices.length - 1];
            const highPrice = Math.max(...prices);
            const lowPrice = Math.min(...prices);
            const changePercent = firstPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
            
            const highEl = document.getElementById('chart-high');
            const lowEl = document.getElementById('chart-low');
            if (highEl) highEl.textContent = formatChartPrice(highPrice);
            if (lowEl) lowEl.textContent = formatChartPrice(lowPrice);
            
            const changeEl = document.getElementById('chart-change');
            if (changeEl) {
                changeEl.textContent = `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
                changeEl.className = `chart-stat-value ${changePercent >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
            }
            
            // Volume — somar volume das klines visíveis (usa candleData global)
            if (candleData && candleData.length > 0) {
                try {
                    const lastClose = candleData[candleData.length - 1][4];
                    let totalVol = 0;
                    candleData.forEach(k => totalVol += k[5]); // k[5] = volume
                    const volUSD = totalVol * lastClose;
                    const volEl = document.getElementById('chart-volume');
                    if (volEl) volEl.textContent = volUSD > 1e9 ? `$${(volUSD/1e9).toFixed(2)}B` : volUSD > 1e6 ? `$${(volUSD/1e6).toFixed(2)}M` : `$${(volUSD/1e3).toFixed(1)}K`;
                } catch(e) {
                    const volEl = document.getElementById('chart-volume');
                    if (volEl) volEl.textContent = '--';
                }
            }
        }

