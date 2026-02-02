const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const CMC_API_KEY = process.env.CMC_API_KEY || 'c3989cf0317a4eacbda6802f3c851a16';

// FOMC Meetings 2025-2026
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
    return FOMC_MEETINGS[FOMC_MEETINGS.length - 1];
}

async function fetchCMCData() {
    const result = {
        fearGreed: null,
        fearGreedClassification: '',
        btcDominance: null,
        altseasonIndex: null,
        fedWatch: null,
        marketIndicators: null,
        lastUpdate: new Date().toISOString(),
        error: null
    };

    // 1. Buscar Global Metrics (BTC Dominance)
    try {
        const response = await fetch('https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest', {
            headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY, 'Accept': 'application/json' }
        });
        if (response.ok) {
            const data = await response.json();
            if (data.data?.btc_dominance) {
                result.btcDominance = parseFloat(data.data.btc_dominance.toFixed(2));
                console.log('✅ BTC Dominance:', result.btcDominance + '%');
            }
        }
    } catch (e) { console.error('❌ Global Metrics:', e.message); }

    // 2. Buscar Fear & Greed Index
    try {
        const response = await fetch('https://pro-api.coinmarketcap.com/v3/fear-and-greed/latest', {
            headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY, 'Accept': 'application/json' }
        });
        if (response.ok) {
            const data = await response.json();
            if (data.data?.value) {
                result.fearGreed = parseInt(data.data.value);
                result.fearGreedClassification = data.data.value_classification || '';
                console.log('✅ Fear & Greed:', result.fearGreed, `(${result.fearGreedClassification})`);
            }
        }
    } catch (e) { console.error('❌ Fear & Greed:', e.message); }

    // 3. Calcular Altseason Index
    try {
        console.log('📊 Calculando Altseason Index...');
        await new Promise(r => setTimeout(r, 1000));
        
        const coinsRes = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false');
        if (coinsRes.ok) {
            const coins = await coinsRes.json();
            const btc = coins.find(c => c.id === 'bitcoin');
            if (btc) {
                const btcAthChange = btc.ath_change_percentage || 0;
                const excluded = ['bitcoin', 'tether', 'usd-coin', 'dai', 'binance-usd', 'true-usd', 'pax-dollar', 'first-digital-usd', 'ethena-usde', 'usds', 'wrapped-bitcoin', 'steth', 'weth', 'wrapped-steth', 'cbeth', 'rocket-pool-eth', 'frax-ether', 'coinbase-wrapped-btc', 'leo-token', 'multi-collateral-dai'];
                const altcoins = coins.filter(c => !excluded.includes(c.id)).slice(0, 50);
                let outperformCount = 0;
                altcoins.forEach(coin => { if ((coin.ath_change_percentage || -100) > btcAthChange) outperformCount++; });
                const rawRatio = outperformCount / altcoins.length;
                const btcDomFactor = (100 - result.btcDominance) / 100;
                result.altseasonIndex = Math.round((rawRatio * 40) + (btcDomFactor * 60));
                result.altseasonIndex = Math.min(100, Math.max(0, result.altseasonIndex));
                console.log(`✅ Altseason Index: ${result.altseasonIndex}`);
            }
        }
    } catch (e) {
        console.error('❌ Altseason:', e.message);
        if (result.btcDominance) result.altseasonIndex = Math.min(100, Math.max(0, Math.round(100 - (result.btcDominance * 1.4))));
    }

    // 4. Fed Watch - Taxa atual e probabilidades
    try {
        console.log('🏦 Buscando dados do Fed Watch...');
        let currentRate = 4.375, currentRateRange = '4.25-4.50%';
        
        try {
            const fredRes = await fetch('https://api.stlouisfed.org/fred/series/observations?series_id=DFEDTARU&api_key=DEMO&file_type=json&limit=1&sort_order=desc');
            if (fredRes.ok) {
                const fredData = await fredRes.json();
                if (fredData.observations?.[0]?.value) {
                    const upperRate = parseFloat(fredData.observations[0].value);
                    currentRate = upperRate - 0.125;
                    currentRateRange = `${(upperRate - 0.25).toFixed(2)}-${upperRate.toFixed(2)}%`;
                }
            }
        } catch (e) { }
        
        const nextMeeting = getNextFOMCMeeting();
        let cutProb = 25, holdProb = 65, hikeProb = 10;
        if (result.fearGreed) {
            if (result.fearGreed < 25) { cutProb = 40; holdProb = 55; hikeProb = 5; }
            else if (result.fearGreed < 45) { cutProb = 30; holdProb = 60; hikeProb = 10; }
            else if (result.fearGreed > 75) { cutProb = 15; holdProb = 70; hikeProb = 15; }
        }
        
        result.fedWatch = {
            currentRate: { range: currentRateRange, midpoint: currentRate },
            nextMeeting: { date: nextMeeting.date, label: nextMeeting.label, time: nextMeeting.time, daysUntil: nextMeeting.daysUntil },
            probabilities: { cut: cutProb, hold: holdProb, hike: hikeProb },
            lastDecision: 'Corte 25pb'
        };
        console.log(`✅ Fed Watch: ${currentRateRange}, Próxima: ${nextMeeting.label} (${nextMeeting.daysUntil} dias)`);
    } catch (e) {
        console.error('❌ Fed Watch:', e.message);
        result.fedWatch = { currentRate: { range: '4.25-4.50%', midpoint: 4.375 }, nextMeeting: getNextFOMCMeeting(), probabilities: { cut: 25, hold: 65, hike: 10 }, lastDecision: 'Corte 25pb' };
    }

    // 5. Indicadores de Mercado
    try {
        console.log('📈 Buscando indicadores de mercado...');
        result.marketIndicators = { vix: null, dxy: null, gold: null, sp500: null, treasury10y: null, btcPrice: null, ethPrice: null, totalMarketCap: null };
        
        const yahooHeaders = { 'User-Agent': 'Mozilla/5.0' };
        
        // VIX
        try {
            const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=2d', { headers: yahooHeaders });
            if (r.ok) {
                const d = await r.json();
                const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
                const prev = d?.chart?.result?.[0]?.meta?.previousClose;
                if (price) result.marketIndicators.vix = { value: parseFloat(price.toFixed(2)), change: prev ? parseFloat(((price - prev) / prev * 100).toFixed(2)) : 0, status: price > 25 ? 'high' : price > 18 ? 'elevated' : 'normal' };
            }
        } catch (e) { }
        console.log('   VIX:', result.marketIndicators.vix?.value || 'N/A');
        
        // DXY
        try {
            const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=2d', { headers: yahooHeaders });
            if (r.ok) {
                const d = await r.json();
                const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
                const prev = d?.chart?.result?.[0]?.meta?.previousClose;
                if (price) result.marketIndicators.dxy = { value: parseFloat(price.toFixed(2)), change: prev ? parseFloat(((price - prev) / prev * 100).toFixed(2)) : 0 };
            }
        } catch (e) { }
        console.log('   DXY:', result.marketIndicators.dxy?.value || 'N/A');
        
        // Gold
        try {
            const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=2d', { headers: yahooHeaders });
            if (r.ok) {
                const d = await r.json();
                const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
                const prev = d?.chart?.result?.[0]?.meta?.previousClose;
                if (price) result.marketIndicators.gold = { value: parseFloat(price.toFixed(2)), change: prev ? parseFloat(((price - prev) / prev * 100).toFixed(2)) : 0 };
            }
        } catch (e) { }
        console.log('   Gold:', result.marketIndicators.gold?.value || 'N/A');
        
        // S&P 500
        try {
            const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=2d', { headers: yahooHeaders });
            if (r.ok) {
                const d = await r.json();
                const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
                const prev = d?.chart?.result?.[0]?.meta?.previousClose;
                if (price) result.marketIndicators.sp500 = { value: parseFloat(price.toFixed(2)), change: prev ? parseFloat(((price - prev) / prev * 100).toFixed(2)) : 0 };
            }
        } catch (e) { }
        console.log('   S&P500:', result.marketIndicators.sp500?.value || 'N/A');
        
        // 10Y Treasury
        try {
            const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=2d', { headers: yahooHeaders });
            if (r.ok) {
                const d = await r.json();
                const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
                const prev = d?.chart?.result?.[0]?.meta?.previousClose;
                if (price) result.marketIndicators.treasury10y = { value: parseFloat(price.toFixed(3)), change: prev ? parseFloat(((price - prev) / prev * 100).toFixed(2)) : 0 };
            }
        } catch (e) { }
        console.log('   10Y Treasury:', result.marketIndicators.treasury10y?.value ? result.marketIndicators.treasury10y.value + '%' : 'N/A');
        
        // BTC e ETH via Binance
        try {
            const [btcRes, ethRes] = await Promise.all([
                fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'),
                fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT')
            ]);
            if (btcRes.ok) { const btc = await btcRes.json(); result.marketIndicators.btcPrice = { value: parseFloat(parseFloat(btc.lastPrice).toFixed(2)), change: parseFloat(btc.priceChangePercent) }; }
            if (ethRes.ok) { const eth = await ethRes.json(); result.marketIndicators.ethPrice = { value: parseFloat(parseFloat(eth.lastPrice).toFixed(2)), change: parseFloat(eth.priceChangePercent) }; }
        } catch (e) { }
        console.log('   BTC:', result.marketIndicators.btcPrice?.value || 'N/A');
        
        // Total Market Cap
        try {
            const r = await fetch('https://api.coingecko.com/api/v3/global');
            if (r.ok) {
                const global = await r.json();
                const totalMcap = global.data?.total_market_cap?.usd;
                if (totalMcap) result.marketIndicators.totalMarketCap = { value: totalMcap, formatted: totalMcap >= 1e12 ? `$${(totalMcap / 1e12).toFixed(2)}T` : `$${(totalMcap / 1e9).toFixed(2)}B`, change: global.data?.market_cap_change_percentage_24h_usd || 0 };
            }
        } catch (e) { }
        console.log('   Total MCap:', result.marketIndicators.totalMarketCap?.formatted || 'N/A');
        console.log('✅ Indicadores de mercado carregados');
    } catch (e) { console.error('❌ Indicadores:', e.message); }

    return result;
}

async function main() {
    console.log('🚀 Buscando dados do CoinMarketCap + Indicadores...');
    console.log('📅 Data:', new Date().toISOString());
    
    const data = await fetchCMCData();
    
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    
    const filePath = path.join(dataDir, 'cmc-data.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    console.log('💾 Dados salvos em:', filePath);
    console.log('📊 Resultado:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
