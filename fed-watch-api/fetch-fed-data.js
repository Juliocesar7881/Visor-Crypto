const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');

// FOMC Meetings 2025-2026
const FOMC_MEETINGS = [
    { date: '2025-01-29', label: '28-29 Jan 2025' },
    { date: '2025-03-19', label: '18-19 Mar 2025' },
    { date: '2025-05-07', label: '6-7 Mai 2025' },
    { date: '2025-06-18', label: '17-18 Jun 2025' },
    { date: '2025-07-30', label: '29-30 Jul 2025' },
    { date: '2025-09-17', label: '16-17 Set 2025' },
    { date: '2025-11-05', label: '4-5 Nov 2025' },
    { date: '2025-12-17', label: '16-17 Dez 2025' },
    { date: '2026-01-28', label: '27-28 Jan 2026' },
    { date: '2026-03-18', label: '17-18 Mar 2026' },
    { date: '2026-05-06', label: '5-6 Mai 2026' },
    { date: '2026-06-17', label: '16-17 Jun 2026' },
    { date: '2026-07-29', label: '28-29 Jul 2026' },
    { date: '2026-09-16', label: '15-16 Set 2026' },
    { date: '2026-11-04', label: '3-4 Nov 2026' },
    { date: '2026-12-16', label: '15-16 Dez 2026' }
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

async function fetchCMEFedWatch() {
    try {
        // Tentar buscar do CME Group
        const cmeUrl = 'https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html';
        const response = await fetch(cmeUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (response.ok) {
            const html = await response.text();
            // Tentar extrair dados do HTML (se disponível em JSON embutido)
            const jsonMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/s);
            if (jsonMatch) {
                const data = JSON.parse(jsonMatch[1]);
                console.log('CME data found');
                return data;
            }
        }
    } catch (e) {
        console.log('CME fetch error:', e.message);
    }
    return null;
}

async function fetchTreasuryRates() {
    try {
        // FRED API (Federal Reserve Economic Data) - Gratuita
        const fredUrl = 'https://api.stlouisfed.org/fred/series/observations?series_id=DFF&api_key=DEMO&file_type=json&limit=5&sort_order=desc';
        const response = await fetch(fredUrl);
        
        if (response.ok) {
            const data = await response.json();
            if (data.observations && data.observations.length > 0) {
                return parseFloat(data.observations[0].value);
            }
        }
    } catch (e) {
        console.log('FRED fetch error:', e.message);
    }
    
    // Fallback: buscar de outra fonte
    try {
        const yahooUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EIRX?interval=1d&range=5d';
        const response = await fetch(yahooUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
            if (price) {
                return price / 100; // IRX é em basis points
            }
        }
    } catch (e) {
        console.log('Yahoo fetch error:', e.message);
    }
    
    return null;
}

async function fetchFearGreed() {
    try {
        const response = await fetch('https://api.alternative.me/fng/?limit=1');
        if (response.ok) {
            const data = await response.json();
            return {
                value: parseInt(data.data[0].value),
                classification: data.data[0].value_classification
            };
        }
    } catch (e) {
        console.log('Fear & Greed fetch error:', e.message);
    }
    return { value: 50, classification: 'Neutral' };
}

function calculateProbabilities(treasuryRate, fearGreed) {
    // Taxa atual do Fed: 4.25-4.50% (midpoint 4.375%)
    const currentFedRate = 4.375;
    const currentRateRange = '4.25-4.50%';
    
    // Calcular probabilidades baseado no spread
    let cutProb, holdProb, hikeProb;
    
    if (treasuryRate) {
        const rateSpread = treasuryRate - currentFedRate;
        
        if (rateSpread < -0.10) {
            cutProb = Math.min(95, 60 + Math.abs(rateSpread) * 200);
            holdProb = Math.max(5, 35 - Math.abs(rateSpread) * 150);
            hikeProb = Math.max(0, 5 - Math.abs(rateSpread) * 50);
        } else if (rateSpread > 0.10) {
            hikeProb = Math.min(50, 10 + rateSpread * 150);
            holdProb = Math.max(30, 70 - rateSpread * 100);
            cutProb = Math.max(5, 20 - rateSpread * 100);
        } else {
            holdProb = 65;
            cutProb = 25;
            hikeProb = 10;
        }
    } else {
        // Valores padrão se não conseguir dados
        holdProb = 65;
        cutProb = 25;
        hikeProb = 10;
    }
    
    // Ajuste baseado em Fear & Greed
    if (fearGreed.value < 25) {
        cutProb += 5;
        holdProb -= 3;
        hikeProb -= 2;
    } else if (fearGreed.value > 75) {
        cutProb -= 3;
        holdProb += 2;
        hikeProb += 1;
    }
    
    // Normalizar para 100%
    const total = cutProb + holdProb + hikeProb;
    cutProb = Math.max(0, Math.round((cutProb / total) * 100));
    holdProb = Math.max(0, Math.round((holdProb / total) * 100));
    hikeProb = Math.max(0, 100 - cutProb - holdProb);
    
    return {
        cutProb,
        holdProb,
        hikeProb,
        currentFedRate: currentRateRange,
        impliedRate: treasuryRate ? treasuryRate.toFixed(3) : currentFedRate.toFixed(3)
    };
}

async function main() {
    console.log('🏦 Fetching Fed Watch data...');
    console.log('⏰ Time:', new Date().toISOString());
    
    // Buscar dados em paralelo
    const [treasuryRate, fearGreed] = await Promise.all([
        fetchTreasuryRates(),
        fetchFearGreed()
    ]);
    
    console.log('📊 Treasury Rate:', treasuryRate);
    console.log('😰 Fear & Greed:', fearGreed);
    
    // Calcular probabilidades
    const probs = calculateProbabilities(treasuryRate, fearGreed);
    
    // Próxima reunião
    const nextMeeting = getNextFOMCMeeting();
    
    // Montar dados finais
    const fedWatchData = {
        lastUpdate: new Date().toISOString(),
        nextMeeting: {
            date: nextMeeting.date,
            label: nextMeeting.label,
            daysUntil: nextMeeting.daysUntil
        },
        currentRate: {
            range: probs.currentFedRate,
            midpoint: 4.375
        },
        probabilities: {
            cut: probs.cutProb,
            hold: probs.holdProb,
            hike: probs.hikeProb
        },
        market: {
            impliedRate: probs.impliedRate,
            fearGreed: fearGreed.value,
            fearGreedClassification: fearGreed.classification
        },
        source: 'GitHub Actions - Fed Watch API'
    };
    
    // Criar pasta data se não existir
    if (!fs.existsSync('data')) {
        fs.mkdirSync('data');
    }
    
    // Salvar JSON
    fs.writeFileSync('data/fed-watch.json', JSON.stringify(fedWatchData, null, 2));
    console.log('✅ Data saved to data/fed-watch.json');
    console.log(JSON.stringify(fedWatchData, null, 2));
}

main().catch(console.error);
