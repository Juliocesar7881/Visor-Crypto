import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// ============================================
// 🔧 CONFIGURAÇÃO DAS APIs GRATUITAS
// ============================================
// Substitua 'YOUR_API_KEY' pelas suas chaves reais
// Guia para obter: https://site.financialmodelingprep.com/developer/docs

const FMP_API_KEY = 'yTzpl8eGbfIStxlI6xBjQoiHycAb4PhZ'; // Financial Modeling Prep - 250 req/dia grátis
const ALPHA_VANTAGE_KEY = 'YOUR_ALPHA_VANTAGE_KEY'; // Alpha Vantage - 25 req/dia grátis
const FINNHUB_KEY = 'd5j4209r01qh37ui6ehgd5j4209r01qh37ui6ei0'; // Finnhub - 60 req/min grátis

// ============================================
// 📊 INTERFACES
// ============================================

export interface MacroEvent {
  id: string;
  title: string;
  date: string;
  country: string;
  impact: 'high' | 'medium' | 'low';
  actual?: string;
  forecast?: string;
  previous?: string;
  category: string;
}

export interface FedData {
  meeting_date: string;
  rate_probability: {
    no_change: number;
    cut_25bp: number;
    cut_50bp: number;
    hike_25bp: number;
  };
  current_rate: string;
}

export interface MarketIndicator {
  name: string;
  value: string;
  change: number;
  changePercent: number;
  icon: string;
}

interface CachedData<T> {
  data: T;
  timestamp: number;
}

// ============================================
// 🗄️ CACHE MANAGEMENT
// ============================================

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos em ms
const CACHE_KEYS = {
  FED_DATA: 'macro_fed_data',
  CALENDAR: 'macro_calendar',
  INDICATORS: 'macro_indicators',
};

async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    const cached = await SecureStore.getItemAsync(key);
    if (cached) {
      const parsed: CachedData<T> = JSON.parse(cached);
      const isExpired = Date.now() - parsed.timestamp > CACHE_DURATION;
      if (!isExpired) {
        console.log(`📦 Cache hit: ${key}`);
        return parsed.data;
      }
    }
    return null;
  } catch (error) {
    console.error('Cache read error:', error);
    return null;
  }
}

async function saveToCache<T>(key: string, data: T): Promise<void> {
  try {
    const cacheItem: CachedData<T> = {
      data,
      timestamp: Date.now(),
    };
    await SecureStore.setItemAsync(key, JSON.stringify(cacheItem));
    console.log(`💾 Cache saved: ${key}`);
  } catch (error) {
    console.error('Cache write error:', error);
  }
}

// ============================================
// 📅 ECONOMIC CALENDAR - Financial Modeling Prep
// ============================================

export async function fetchEconomicCalendar(): Promise<MacroEvent[]> {
  // Tenta cache primeiro
  const cached = await getFromCache<MacroEvent[]>(CACHE_KEYS.CALENDAR);
  if (cached) return cached;

  try {
    // Calcula datas: hoje até 30 dias no futuro
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 30);

    const fromDate = today.toISOString().split('T')[0];
    const toDate = futureDate.toISOString().split('T')[0];

    // Financial Modeling Prep API
    const response = await axios.get(
      `https://financialmodelingprep.com/api/v3/economic_calendar?from=${fromDate}&to=${toDate}&apikey=${FMP_API_KEY}`,
      { timeout: 10000 }
    );

    if (!response.data || response.data.length === 0) {
      throw new Error('Empty response from FMP');
    }

    // Filtra eventos de alto impacto e formata
    const events: MacroEvent[] = response.data
      .filter((event: any) => {
        // Filtra apenas eventos importantes (EUA, EUR, China, etc)
        const importantCountries = ['US', 'EU', 'CN', 'JP', 'GB', 'BR'];
        return importantCountries.includes(event.country);
      })
      .slice(0, 20) // Limita a 20 eventos
      .map((event: any, index: number) => ({
        id: `fmp_${index}`,
        title: translateEventTitle(event.event),
        date: event.date,
        country: translateCountry(event.country),
        impact: determineImpact(event.impact || event.event),
        actual: event.actual ? String(event.actual) : undefined,
        forecast: event.estimate ? String(event.estimate) : undefined,
        previous: event.previous ? String(event.previous) : undefined,
        category: categorizeEvent(event.event),
      }));

    await saveToCache(CACHE_KEYS.CALENDAR, events);
    console.log(`✅ Calendar loaded: ${events.length} events`);
    return events;

  } catch (error) {
    console.error('FMP Calendar API error:', error);

    // Tenta Finnhub como fallback
    try {
      return await fetchCalendarFromFinnhub();
    } catch (fallbackError) {
      console.error('Finnhub fallback error:', fallbackError);
      // Retorna dados mock se tudo falhar
      return getMockCalendarEvents();
    }
  }
}

// Fallback: Finnhub Calendar
async function fetchCalendarFromFinnhub(): Promise<MacroEvent[]> {
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + 30);

  const fromDate = today.toISOString().split('T')[0];
  const toDate = futureDate.toISOString().split('T')[0];

  const response = await axios.get(
    `https://finnhub.io/api/v1/calendar/economic?from=${fromDate}&to=${toDate}&token=${FINNHUB_KEY}`,
    { timeout: 10000 }
  );

  const events: MacroEvent[] = response.data.economicCalendar
    .slice(0, 20)
    .map((event: any, index: number) => ({
      id: `fh_${index}`,
      title: translateEventTitle(event.event),
      date: event.time,
      country: translateCountry(event.country),
      impact: event.impact === 3 ? 'high' : event.impact === 2 ? 'medium' : 'low',
      actual: event.actual ? String(event.actual) : undefined,
      forecast: event.estimate ? String(event.estimate) : undefined,
      previous: event.prev ? String(event.prev) : undefined,
      category: categorizeEvent(event.event),
    }));

  await saveToCache(CACHE_KEYS.CALENDAR, events);
  return events;
}

// ============================================
// 🏛️ FED WATCH DATA
// ============================================

export async function fetchFedData(): Promise<FedData> {
  // Tenta cache primeiro
  const cached = await getFromCache<FedData>(CACHE_KEYS.FED_DATA);
  if (cached) return cached;

  try {
    // FMP tem dados de Treasury e pode inferir expectativas
    // Também podemos usar dados de futuros
    const [treasuryResponse, fedRateResponse] = await Promise.all([
      axios.get(
        `https://financialmodelingprep.com/api/v3/treasury?from=2026-01-01&to=2026-01-31&apikey=${FMP_API_KEY}`,
        { timeout: 10000 }
      ),
      axios.get(
        `https://financialmodelingprep.com/api/v4/economic?name=federalFundsRate&apikey=${FMP_API_KEY}`,
        { timeout: 10000 }
      ),
    ]);

    // Calcula probabilidades baseado em dados de mercado
    // Nota: Isso é uma aproximação - dados reais viriam do CME FedWatch
    const currentRate = fedRateResponse.data?.[0]?.value || 4.50;
    
    // Próxima reunião do Fed (geralmente última quarta-feira do mês)
    const nextMeeting = getNextFedMeeting();

    // Calcula probabilidades aproximadas baseado no spread Treasury
    const probabilities = calculateFedProbabilities(treasuryResponse.data, currentRate);

    const fedData: FedData = {
      meeting_date: nextMeeting,
      rate_probability: probabilities,
      current_rate: `${currentRate.toFixed(2)}% - ${(currentRate + 0.25).toFixed(2)}%`,
    };

    await saveToCache(CACHE_KEYS.FED_DATA, fedData);
    console.log('✅ Fed data loaded');
    return fedData;

  } catch (error) {
    console.error('Fed data API error:', error);
    return getMockFedData();
  }
}

function getNextFedMeeting(): string {
  // Datas das reuniões do FOMC em 2026 (estimadas)
  const fomcDates = [
    '2026-01-29', '2026-03-19', '2026-05-07', '2026-06-18',
    '2026-07-30', '2026-09-17', '2026-11-05', '2026-12-17',
  ];

  const today = new Date();
  for (const date of fomcDates) {
    if (new Date(date) > today) {
      return date;
    }
  }
  return fomcDates[0]; // Fallback
}

function calculateFedProbabilities(treasuryData: any[], currentRate: number): FedData['rate_probability'] {
  // Algoritmo simplificado para estimar probabilidades
  // Baseado em yield curve e spread
  
  if (!treasuryData || treasuryData.length === 0) {
    return { no_change: 50, cut_25bp: 35, cut_50bp: 10, hike_25bp: 5 };
  }

  const latest = treasuryData[0];
  const spread2y10y = (latest.year10 || 4.2) - (latest.year2 || 4.0);
  
  // Curva invertida sugere cortes
  if (spread2y10y < 0) {
    return { no_change: 25, cut_25bp: 50, cut_50bp: 20, hike_25bp: 5 };
  } else if (spread2y10y < 0.5) {
    return { no_change: 45, cut_25bp: 40, cut_50bp: 10, hike_25bp: 5 };
  } else {
    return { no_change: 60, cut_25bp: 20, cut_50bp: 5, hike_25bp: 15 };
  }
}

// ============================================
// 📊 MARKET INDICATORS
// ============================================

export async function fetchMarketIndicators(): Promise<MarketIndicator[]> {
  // Tenta cache primeiro
  const cached = await getFromCache<MarketIndicator[]>(CACHE_KEYS.INDICATORS);
  if (cached) return cached;

  try {
    // Busca múltiplos indicadores em paralelo
    const [dxyResponse, goldResponse, oilResponse, vixResponse, sp500Response] = await Promise.all([
      axios.get(
        `https://financialmodelingprep.com/api/v3/quote/DX-Y.NYB?apikey=${FMP_API_KEY}`,
        { timeout: 8000 }
      ).catch(() => null),
      axios.get(
        `https://financialmodelingprep.com/api/v3/quote/GCUSD?apikey=${FMP_API_KEY}`,
        { timeout: 8000 }
      ).catch(() => null),
      axios.get(
        `https://financialmodelingprep.com/api/v3/quote/CLUSD?apikey=${FMP_API_KEY}`,
        { timeout: 8000 }
      ).catch(() => null),
      axios.get(
        `https://financialmodelingprep.com/api/v3/quote/^VIX?apikey=${FMP_API_KEY}`,
        { timeout: 8000 }
      ).catch(() => null),
      axios.get(
        `https://financialmodelingprep.com/api/v3/quote/^GSPC?apikey=${FMP_API_KEY}`,
        { timeout: 8000 }
      ).catch(() => null),
    ]);

    // Treasury yield separado
    const treasuryResponse = await axios.get(
      `https://financialmodelingprep.com/api/v3/treasury?from=2026-01-01&to=2026-01-31&apikey=${FMP_API_KEY}`,
      { timeout: 8000 }
    ).catch(() => null);

    const indicators: MarketIndicator[] = [];

    // DXY
    if (dxyResponse?.data?.[0]) {
      const d = dxyResponse.data[0];
      indicators.push({
        name: 'DXY (Índice Dólar)',
        value: d.price?.toFixed(2) || '103.00',
        change: d.change || 0,
        changePercent: d.changesPercentage || 0,
        icon: '💵',
      });
    } else {
      indicators.push({ name: 'DXY (Índice Dólar)', value: '103.45', change: -0.32, changePercent: -0.31, icon: '💵' });
    }

    // Treasury 10Y
    if (treasuryResponse?.data?.[0]) {
      const t = treasuryResponse.data[0];
      indicators.push({
        name: 'US 10Y Treasury',
        value: `${(t.year10 || 4.28).toFixed(2)}%`,
        change: 0.05,
        changePercent: 1.18,
        icon: '📜',
      });
    } else {
      indicators.push({ name: 'US 10Y Treasury', value: '4.28%', change: 0.05, changePercent: 1.18, icon: '📜' });
    }

    // VIX
    if (vixResponse?.data?.[0]) {
      const v = vixResponse.data[0];
      indicators.push({
        name: 'VIX (Volatilidade)',
        value: v.price?.toFixed(2) || '14.52',
        change: v.change || 0,
        changePercent: v.changesPercentage || 0,
        icon: '📊',
      });
    } else {
      indicators.push({ name: 'VIX (Volatilidade)', value: '14.52', change: -0.85, changePercent: -5.52, icon: '📊' });
    }

    // Gold
    if (goldResponse?.data?.[0]) {
      const g = goldResponse.data[0];
      indicators.push({
        name: 'Ouro (XAU/USD)',
        value: `$${g.price?.toFixed(2) || '2,048.50'}`,
        change: g.change || 0,
        changePercent: g.changesPercentage || 0,
        icon: '🥇',
      });
    } else {
      indicators.push({ name: 'Ouro (XAU/USD)', value: '$2,048.50', change: 12.30, changePercent: 0.60, icon: '🥇' });
    }

    // Oil
    if (oilResponse?.data?.[0]) {
      const o = oilResponse.data[0];
      indicators.push({
        name: 'Petróleo WTI',
        value: `$${o.price?.toFixed(2) || '75.82'}`,
        change: o.change || 0,
        changePercent: o.changesPercentage || 0,
        icon: '🛢️',
      });
    } else {
      indicators.push({ name: 'Petróleo WTI', value: '$75.82', change: -1.24, changePercent: -1.61, icon: '🛢️' });
    }

    // S&P 500
    if (sp500Response?.data?.[0]) {
      const s = sp500Response.data[0];
      indicators.push({
        name: 'S&P 500',
        value: s.price?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '4,892.50',
        change: s.change || 0,
        changePercent: s.changesPercentage || 0,
        icon: '📈',
      });
    } else {
      indicators.push({ name: 'S&P 500', value: '4,892.50', change: 28.45, changePercent: 0.58, icon: '📈' });
    }

    await saveToCache(CACHE_KEYS.INDICATORS, indicators);
    console.log('✅ Market indicators loaded');
    return indicators;

  } catch (error) {
    console.error('Market indicators API error:', error);
    return getMockIndicators();
  }
}

// ============================================
// ⚡ REALTIME INDICATORS (sem cache, direto da API)
// ============================================

export async function fetchIndicatorsRealtime(): Promise<MarketIndicator[]> {
  console.log('⚡ Fetching realtime indicators...');
  
  try {
    // Busca todos os indicadores em paralelo, direto da API (sem cache)
    const [dxyResponse, goldResponse, oilResponse, vixResponse, sp500Response, treasuryResponse] = await Promise.all([
      axios.get(
        `https://financialmodelingprep.com/api/v3/quote/DX-Y.NYB?apikey=${FMP_API_KEY}`,
        { timeout: 8000 }
      ).catch(() => null),
      axios.get(
        `https://financialmodelingprep.com/api/v3/quote/GCUSD?apikey=${FMP_API_KEY}`,
        { timeout: 8000 }
      ).catch(() => null),
      axios.get(
        `https://financialmodelingprep.com/api/v3/quote/CLUSD?apikey=${FMP_API_KEY}`,
        { timeout: 8000 }
      ).catch(() => null),
      axios.get(
        `https://financialmodelingprep.com/api/v3/quote/^VIX?apikey=${FMP_API_KEY}`,
        { timeout: 8000 }
      ).catch(() => null),
      axios.get(
        `https://financialmodelingprep.com/api/v3/quote/^GSPC?apikey=${FMP_API_KEY}`,
        { timeout: 8000 }
      ).catch(() => null),
      axios.get(
        `https://financialmodelingprep.com/api/v3/treasury?apikey=${FMP_API_KEY}`,
        { timeout: 8000 }
      ).catch(() => null),
    ]);

    const indicators: MarketIndicator[] = [];

    // DXY
    if (dxyResponse?.data?.[0]) {
      const d = dxyResponse.data[0];
      indicators.push({
        name: 'DXY (Índice Dólar)',
        value: d.price?.toFixed(2) || '103.00',
        change: d.change || 0,
        changePercent: d.changesPercentage || 0,
        icon: '💵',
      });
    }

    // Treasury 10Y
    if (treasuryResponse?.data?.[0]) {
      const t = treasuryResponse.data[0];
      indicators.push({
        name: 'US 10Y Treasury',
        value: `${(t.year10 || 4.28).toFixed(2)}%`,
        change: 0.05,
        changePercent: 1.18,
        icon: '📜',
      });
    }

    // VIX
    if (vixResponse?.data?.[0]) {
      const v = vixResponse.data[0];
      indicators.push({
        name: 'VIX (Volatilidade)',
        value: v.price?.toFixed(2) || '14.52',
        change: v.change || 0,
        changePercent: v.changesPercentage || 0,
        icon: '📊',
      });
    }

    // Gold
    if (goldResponse?.data?.[0]) {
      const g = goldResponse.data[0];
      indicators.push({
        name: 'Ouro (XAU/USD)',
        value: `$${g.price?.toFixed(2) || '2,048.50'}`,
        change: g.change || 0,
        changePercent: g.changesPercentage || 0,
        icon: '🥇',
      });
    }

    // Oil
    if (oilResponse?.data?.[0]) {
      const o = oilResponse.data[0];
      indicators.push({
        name: 'Petróleo WTI',
        value: `$${o.price?.toFixed(2) || '75.82'}`,
        change: o.change || 0,
        changePercent: o.changesPercentage || 0,
        icon: '🛢️',
      });
    }

    // S&P 500
    if (sp500Response?.data?.[0]) {
      const s = sp500Response.data[0];
      indicators.push({
        name: 'S&P 500',
        value: s.price?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '4,892.50',
        change: s.change || 0,
        changePercent: s.changesPercentage || 0,
        icon: '📈',
      });
    }

    // Se conseguiu pelo menos alguns indicadores, retorna
    if (indicators.length >= 3) {
      console.log(`⚡ Realtime update: ${indicators.length} indicators`);
      return indicators;
    }

    // Se falhou, retorna array vazio (manterá os dados anteriores)
    return [];

  } catch (error) {
    console.error('Realtime indicators error:', error);
    return [];
  }
}

// ============================================
// 🔧 HELPER FUNCTIONS
// ============================================

function translateEventTitle(title: string): string {
  const translations: { [key: string]: string } = {
    'Interest Rate Decision': 'Decisão de Taxa de Juros',
    'Fed Interest Rate Decision': 'Decisão de Taxa de Juros do Fed',
    'FOMC Statement': 'Comunicado do FOMC',
    'FOMC Meeting Minutes': 'Ata do FOMC',
    'Non-Farm Payrolls': 'Payroll (Emprego)',
    'Unemployment Rate': 'Taxa de Desemprego',
    'CPI': 'Inflação CPI',
    'CPI m/m': 'Inflação CPI (Mensal)',
    'CPI y/y': 'Inflação CPI (Anual)',
    'Core CPI': 'Núcleo da Inflação',
    'GDP': 'PIB',
    'GDP q/q': 'PIB (Trimestral)',
    'Retail Sales': 'Vendas no Varejo',
    'PMI': 'PMI Manufatura',
    'Manufacturing PMI': 'PMI Manufatura',
    'Services PMI': 'PMI Serviços',
    'Trade Balance': 'Balança Comercial',
    'ECB Interest Rate Decision': 'Decisão BCE',
    'BOJ Interest Rate Decision': 'Decisão BOJ',
    'Initial Jobless Claims': 'Pedidos de Seguro-Desemprego',
    'Consumer Confidence': 'Confiança do Consumidor',
    'Durable Goods Orders': 'Pedidos de Bens Duráveis',
    'Housing Starts': 'Construção de Casas',
    'Industrial Production': 'Produção Industrial',
    'PPI': 'Índice de Preços ao Produtor',
  };

  // Tenta encontrar tradução exata ou parcial
  for (const [eng, pt] of Object.entries(translations)) {
    if (title.toLowerCase().includes(eng.toLowerCase())) {
      return pt;
    }
  }
  return title; // Retorna original se não encontrar
}

function translateCountry(code: string): string {
  const countries: { [key: string]: string } = {
    'US': 'EUA',
    'EU': 'EUR',
    'CN': 'CHN',
    'JP': 'JPN',
    'GB': 'GBR',
    'BR': 'BRA',
    'DE': 'ALE',
    'FR': 'FRA',
  };
  return countries[code] || code;
}

function determineImpact(impactOrEvent: string | number): 'high' | 'medium' | 'low' {
  if (typeof impactOrEvent === 'number') {
    if (impactOrEvent >= 3) return 'high';
    if (impactOrEvent >= 2) return 'medium';
    return 'low';
  }

  const highImpactKeywords = [
    'interest rate', 'fed', 'fomc', 'cpi', 'inflation', 'payroll', 'gdp', 'unemployment',
    'taxa de juros', 'inflação', 'pib', 'desemprego',
  ];
  const mediumImpactKeywords = [
    'pmi', 'retail', 'trade', 'consumer confidence', 'housing',
    'varejo', 'balança', 'confiança',
  ];

  const eventLower = impactOrEvent.toLowerCase();

  for (const keyword of highImpactKeywords) {
    if (eventLower.includes(keyword)) return 'high';
  }
  for (const keyword of mediumImpactKeywords) {
    if (eventLower.includes(keyword)) return 'medium';
  }
  return 'low';
}

function categorizeEvent(event: string): string {
  const eventLower = event.toLowerCase();

  if (eventLower.includes('interest') || eventLower.includes('fed') || eventLower.includes('fomc') || eventLower.includes('boj') || eventLower.includes('ecb')) {
    return 'Política Monetária';
  }
  if (eventLower.includes('gdp') || eventLower.includes('pib')) {
    return 'Crescimento';
  }
  if (eventLower.includes('cpi') || eventLower.includes('ppi') || eventLower.includes('inflation')) {
    return 'Inflação';
  }
  if (eventLower.includes('payroll') || eventLower.includes('unemployment') || eventLower.includes('jobless')) {
    return 'Emprego';
  }
  if (eventLower.includes('trade') || eventLower.includes('export') || eventLower.includes('import')) {
    return 'Comércio';
  }
  if (eventLower.includes('retail') || eventLower.includes('consumer')) {
    return 'Consumo';
  }
  if (eventLower.includes('pmi') || eventLower.includes('manufacturing') || eventLower.includes('industrial')) {
    return 'Atividade Econômica';
  }
  return 'Outros';
}

// ============================================
// 📦 MOCK DATA (FALLBACK)
// ============================================

function getMockCalendarEvents(): MacroEvent[] {
  return [
    {
      id: '1',
      title: 'Decisão de Taxa de Juros do Fed',
      date: '2026-01-29T19:00:00Z',
      country: 'EUA',
      impact: 'high',
      forecast: '4.50%',
      previous: '4.75%',
      category: 'Política Monetária',
    },
    {
      id: '2',
      title: 'PIB dos EUA (Q4)',
      date: '2026-01-30T13:30:00Z',
      country: 'EUA',
      impact: 'high',
      forecast: '2.8%',
      previous: '3.1%',
      category: 'Crescimento',
    },
    {
      id: '3',
      title: 'Inflação CPI (YoY)',
      date: '2026-02-12T13:30:00Z',
      country: 'EUA',
      impact: 'high',
      forecast: '2.9%',
      previous: '3.0%',
      category: 'Inflação',
    },
    {
      id: '4',
      title: 'Taxa de Desemprego',
      date: '2026-02-07T13:30:00Z',
      country: 'EUA',
      impact: 'medium',
      forecast: '4.2%',
      previous: '4.1%',
      category: 'Emprego',
    },
    {
      id: '5',
      title: 'Decisão BCE',
      date: '2026-02-06T13:45:00Z',
      country: 'EUR',
      impact: 'high',
      forecast: '3.75%',
      previous: '4.00%',
      category: 'Política Monetária',
    },
    {
      id: '6',
      title: 'PMI Manufatura',
      date: '2026-02-03T15:00:00Z',
      country: 'EUA',
      impact: 'medium',
      forecast: '49.5',
      previous: '49.2',
      category: 'Atividade Econômica',
    },
    {
      id: '7',
      title: 'Vendas no Varejo',
      date: '2026-02-14T13:30:00Z',
      country: 'EUA',
      impact: 'medium',
      forecast: '0.4%',
      previous: '0.3%',
      category: 'Consumo',
    },
    {
      id: '8',
      title: 'Balança Comercial China',
      date: '2026-02-07T03:00:00Z',
      country: 'CHN',
      impact: 'medium',
      forecast: '$75.5B',
      previous: '$72.3B',
      category: 'Comércio',
    },
  ];
}

function getMockFedData(): FedData {
  return {
    meeting_date: '2026-01-29',
    rate_probability: {
      no_change: 45.2,
      cut_25bp: 42.8,
      cut_50bp: 8.5,
      hike_25bp: 3.5,
    },
    current_rate: '4.50% - 4.75%',
  };
}

function getMockIndicators(): MarketIndicator[] {
  return [
    { name: 'DXY (Índice Dólar)', value: '103.45', change: -0.32, changePercent: -0.31, icon: '💵' },
    { name: 'US 10Y Treasury', value: '4.28%', change: 0.05, changePercent: 1.18, icon: '📜' },
    { name: 'VIX (Volatilidade)', value: '14.52', change: -0.85, changePercent: -5.52, icon: '📊' },
    { name: 'Ouro (XAU/USD)', value: '$2,048.50', change: 12.30, changePercent: 0.60, icon: '🥇' },
    { name: 'Petróleo WTI', value: '$75.82', change: -1.24, changePercent: -1.61, icon: '🛢️' },
    { name: 'S&P 500', value: '4,892.50', change: 28.45, changePercent: 0.58, icon: '📈' },
  ];
}

// ============================================
// 🔄 CLEAR CACHE (para forçar atualização)
// ============================================

export async function clearMacroCache(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CACHE_KEYS.FED_DATA);
    await SecureStore.deleteItemAsync(CACHE_KEYS.CALENDAR);
    await SecureStore.deleteItemAsync(CACHE_KEYS.INDICATORS);
    console.log('🗑️ Macro cache cleared');
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

// ============================================
// 📅 LAST UPDATE INFO
// ============================================

export async function getLastUpdateTime(key: 'fed' | 'calendar' | 'indicators'): Promise<Date | null> {
  const cacheKey = {
    fed: CACHE_KEYS.FED_DATA,
    calendar: CACHE_KEYS.CALENDAR,
    indicators: CACHE_KEYS.INDICATORS,
  }[key];

  try {
    const cached = await SecureStore.getItemAsync(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return new Date(parsed.timestamp);
    }
    return null;
  } catch {
    return null;
  }
}
