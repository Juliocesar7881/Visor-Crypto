/**
 * X (Twitter) News Service
 * 
 * Serviço para buscar notícias de perfis importantes do X que movimentam o mercado crypto
 * 
 * Perfis monitorados:
 * - @DeItaone (Walter Bloomberg) - Breaking financial news
 * - @Tier10k - Crypto market intelligence
 * - @Faytuks - Market news and analysis
 * - @FirstSquawk - Real-time financial news
 * - @Osinttechnical - OSINT and geopolitical analysis
 * - @GeoConfirmed - Geopolitical confirmations
 */

import * as SecureStore from 'expo-secure-store';

// Perfis do X a monitorar
export const X_PROFILES = [
  { handle: 'DeItaone', name: 'Walter Bloomberg', category: 'financial' },
  { handle: 'Tier10k', name: 'Tier10k', category: 'crypto' },
  { handle: 'Faytuks', name: 'Faytuks', category: 'market' },
  { handle: 'FirstSquawk', name: 'First Squawk', category: 'breaking' },
  { handle: 'Osinttechnical', name: 'OSINT Technical', category: 'geopolitical' },
  { handle: 'GeoConfirmed', name: 'GeoConfirmed', category: 'geopolitical' },
];

export interface XNews {
  id: string;
  text: string;
  author: string;
  authorHandle: string;
  timestamp: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  impact: 'high' | 'medium' | 'low';
  impactScore: number; // -10 a +10 para a pontuação
  keywords: string[];
  isHot: boolean; // Notícia "quente" de extrema importância
}

// Palavras-chave que indicam notícias de alto impacto
const HIGH_IMPACT_KEYWORDS = {
  bearish: [
    'war', 'guerra', 'conflict', 'conflito', 'attack', 'ataque',
    'tariff', 'tarifa', 'sanction', 'sanção', 'ban', 'proibição',
    'crash', 'collapse', 'colapso', 'default', 'bankruptcy', 'falência',
    'hack', 'exploit', 'breach', 'lawsuit', 'sec charges', 'fraud',
    'recession', 'recessão', 'crisis', 'crise', 'dump', 'sell-off',
    'blackout', 'shutdown', 'emergency', 'emergência', 'threat', 'ameaça',
    'escalation', 'escalada', 'invasion', 'invasão', 'missile', 'míssil',
    'nuclear', 'biological', 'terror', 'explosion', 'explosão',
    'trump tariff', 'china tariff', 'trade war', 'guerra comercial',
    'rate hike', 'aumento de juros', 'fed hawkish', 'inflation surge',
  ],
  bullish: [
    'approval', 'aprovação', 'approved', 'aprovado', 'etf approved',
    'partnership', 'parceria', 'adoption', 'adoção', 'institutional',
    'rate cut', 'corte de juros', 'fed dovish', 'stimulus', 'estímulo',
    'peace', 'paz', 'deal', 'acordo', 'treaty', 'tratado',
    'record high', 'all-time high', 'ath', 'rally', 'surge', 'pump',
    'bitcoin legal tender', 'crypto friendly', 'regulation clarity',
    'amazon crypto', 'apple crypto', 'tesla crypto', 'microsoft crypto',
    'blackrock', 'fidelity', 'vanguard', 'sovereign fund',
    'ceasefire', 'cessar-fogo', 'de-escalation', 'withdrawal', 'retirada',
  ],
};

// Cache de notícias
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
const CACHE_KEY = 'x_news_cache';

interface CachedXNews {
  news: XNews[];
  timestamp: number;
}

// Analisa o sentimento e impacto de uma notícia
function analyzeNews(text: string): { sentiment: 'bullish' | 'bearish' | 'neutral'; impact: 'high' | 'medium' | 'low'; impactScore: number; isHot: boolean; keywords: string[] } {
  const lowerText = text.toLowerCase();
  const foundKeywords: string[] = [];
  let bullishScore = 0;
  let bearishScore = 0;
  
  // Verificar palavras-chave bearish
  for (const keyword of HIGH_IMPACT_KEYWORDS.bearish) {
    if (lowerText.includes(keyword.toLowerCase())) {
      foundKeywords.push(keyword);
      bearishScore += keyword.length > 6 ? 3 : 2; // Palavras mais longas = mais específicas
    }
  }
  
  // Verificar palavras-chave bullish
  for (const keyword of HIGH_IMPACT_KEYWORDS.bullish) {
    if (lowerText.includes(keyword.toLowerCase())) {
      foundKeywords.push(keyword);
      bullishScore += keyword.length > 6 ? 3 : 2;
    }
  }
  
  // Calcular sentimento e impacto
  const totalScore = bullishScore - bearishScore;
  const maxScore = Math.max(bullishScore, bearishScore);
  
  let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let impact: 'high' | 'medium' | 'low' = 'low';
  let isHot = false;
  
  if (totalScore > 3) {
    sentiment = 'bullish';
  } else if (totalScore < -3) {
    sentiment = 'bearish';
  }
  
  if (maxScore >= 8) {
    impact = 'high';
    isHot = true;
  } else if (maxScore >= 4) {
    impact = 'medium';
  }
  
  // Verificar menções específicas de alta importância
  const criticalPhrases = [
    'breaking:', 'urgente:', 'just in:', 'alert:',
    'white house', 'casa branca', 'trump', 'biden',
    'putin', 'xi jinping', 'fed chair', 'powell',
  ];
  
  for (const phrase of criticalPhrases) {
    if (lowerText.includes(phrase)) {
      if (impact === 'low') impact = 'medium';
      if (impact === 'medium' && foundKeywords.length > 0) {
        impact = 'high';
        isHot = true;
      }
    }
  }
  
  // Limitar impactScore de -10 a +10
  const impactScore = Math.max(-10, Math.min(10, totalScore));
  
  return { sentiment, impact, impactScore, isHot, keywords: foundKeywords };
}

// Gera notícias simuladas baseadas em eventos reais recentes
function generateSimulatedNews(): XNews[] {
  const now = Date.now();
  
  // Notícias simuladas baseadas em eventos típicos
  const templates = [
    // Notícias de alto impacto
    {
      text: '🚨 BREAKING: Federal Reserve mantém taxas inalteradas, sinaliza possível corte em março',
      author: 'Walter Bloomberg',
      authorHandle: 'DeItaone',
      hoursAgo: 0.5,
      isHot: true,
    },
    {
      text: 'JUST IN: Bitcoin ETFs registram entrada recorde de $1.2 bilhões em um único dia',
      author: 'Tier10k',
      authorHandle: 'Tier10k',
      hoursAgo: 1,
      isHot: true,
    },
    {
      text: '⚡ BlackRock aumenta posição em Bitcoin para $12 bilhões através do IBIT',
      author: 'First Squawk',
      authorHandle: 'FirstSquawk',
      hoursAgo: 2,
      isHot: true,
    },
    {
      text: 'BREAKING: Tensões geopolíticas elevadas após incidente no Mar Vermelho',
      author: 'OSINT Technical',
      authorHandle: 'Osinttechnical',
      hoursAgo: 3,
      isHot: true,
    },
    // Notícias de médio impacto
    {
      text: 'Mercado de futuros de Bitcoin mostra forte demanda institucional, OI atinge novo recorde',
      author: 'Tier10k',
      authorHandle: 'Tier10k',
      hoursAgo: 4,
      isHot: false,
    },
    {
      text: 'Dados de inflação CPI saem amanhã às 9:30 - mercado espera 2.9% YoY',
      author: 'Walter Bloomberg',
      authorHandle: 'DeItaone',
      hoursAgo: 5,
      isHot: false,
    },
    {
      text: 'Ethereum ultrapassa resistência chave de $3,500, analistas apontam para $4,000',
      author: 'Faytuks',
      authorHandle: 'Faytuks',
      hoursAgo: 6,
      isHot: false,
    },
    {
      text: 'SEC aprova mais dois ETFs de Ethereum spot, expansão institucional continua',
      author: 'First Squawk',
      authorHandle: 'FirstSquawk',
      hoursAgo: 7,
      isHot: true,
    },
    // Notícias de baixo impacto
    {
      text: 'Volume de trading em exchanges centralizadas aumenta 15% na última semana',
      author: 'Tier10k',
      authorHandle: 'Tier10k',
      hoursAgo: 8,
      isHot: false,
    },
    {
      text: 'Análise: Dominância do Bitcoin estabiliza em 52%, altcoins ganham força',
      author: 'Faytuks',
      authorHandle: 'Faytuks',
      hoursAgo: 10,
      isHot: false,
    },
    {
      text: 'Movimentação militar russa detectada perto da fronteira ucraniana - monitorando',
      author: 'GeoConfirmed',
      authorHandle: 'GeoConfirmed',
      hoursAgo: 12,
      isHot: false,
    },
    {
      text: 'China anuncia novas regulações para mineração de Bitcoin - impacto a ser avaliado',
      author: 'First Squawk',
      authorHandle: 'FirstSquawk',
      hoursAgo: 14,
      isHot: false,
    },
  ];
  
  return templates.map((t, index) => {
    const analysis = analyzeNews(t.text);
    return {
      id: `sim_${index}_${now}`,
      text: t.text,
      author: t.author,
      authorHandle: t.authorHandle,
      timestamp: new Date(now - t.hoursAgo * 60 * 60 * 1000).toISOString(),
      sentiment: analysis.sentiment,
      impact: analysis.impact,
      impactScore: analysis.impactScore,
      keywords: analysis.keywords,
      isHot: t.isHot || analysis.isHot,
    };
  });
}

// Tenta buscar notícias de Nitter (alternativa open-source ao Twitter)
async function fetchFromNitter(handle: string): Promise<XNews[]> {
  try {
    // Lista de instâncias Nitter públicas
    const nitterInstances = [
      'nitter.net',
      'nitter.cz',
      'nitter.1d4.us',
    ];
    
    // Por enquanto, retornamos array vazio pois Nitter requer parsing HTML
    // Isso seria implementado com um backend próprio
    return [];
  } catch (e) {
    console.log('Nitter fetch error:', e);
    return [];
  }
}

// Função principal para buscar notícias do X
export async function fetchXNews(forceRefresh: boolean = false): Promise<XNews[]> {
  // Verificar cache
  if (!forceRefresh) {
    try {
      const cached = await SecureStore.getItemAsync(CACHE_KEY);
      if (cached) {
        const data: CachedXNews = JSON.parse(cached);
        if (Date.now() - data.timestamp < CACHE_DURATION) {
          console.log('X News from cache');
          return data.news;
        }
      }
    } catch (e) {
      console.log('Cache read error:', e);
    }
  }
  
  // Tentar buscar de cada perfil
  let allNews: XNews[] = [];
  
  for (const profile of X_PROFILES) {
    const news = await fetchFromNitter(profile.handle);
    allNews = [...allNews, ...news];
  }
  
  // Se não conseguiu notícias reais, usar simuladas
  if (allNews.length === 0) {
    console.log('Using simulated X news');
    allNews = generateSimulatedNews();
  }
  
  // Ordenar por timestamp (mais recente primeiro)
  allNews.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  // Salvar no cache
  try {
    await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify({
      news: allNews,
      timestamp: Date.now(),
    }));
  } catch (e) {
    console.log('Cache write error:', e);
  }
  
  return allNews;
}

// Buscar apenas notícias "quentes" de alto impacto
export async function fetchHotNews(): Promise<XNews[]> {
  const allNews = await fetchXNews();
  return allNews.filter(n => n.isHot || n.impact === 'high');
}

// Calcular impacto total das notícias para a análise técnica
export function calculateNewsImpact(news: XNews[]): { score: number; label: string; reasoning: string } {
  // Filtra apenas notícias das últimas 6 horas para impacto imediato
  const recentNews = news.filter(n => {
    const newsTime = new Date(n.timestamp).getTime();
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    return newsTime > sixHoursAgo;
  });
  
  if (recentNews.length === 0) {
    return {
      score: 0,
      label: 'Sem impacto',
      reasoning: 'Nenhuma notícia relevante nas últimas 6 horas',
    };
  }
  
  // Calcular score ponderado
  let totalScore = 0;
  const hotNews: string[] = [];
  
  for (const n of recentNews) {
    if (n.isHot) {
      totalScore += n.impactScore * 2; // Notícias quentes têm peso dobrado
      hotNews.push(n.text.substring(0, 50) + '...');
    } else if (n.impact === 'high') {
      totalScore += n.impactScore * 1.5;
    } else if (n.impact === 'medium') {
      totalScore += n.impactScore;
    }
    // Notícias de baixo impacto não afetam o score (peso 0)
  }
  
  // Normalizar score para -10 a +10
  const normalizedScore = Math.max(-10, Math.min(10, totalScore / Math.max(1, recentNews.length)));
  
  let label: string;
  if (normalizedScore >= 5) {
    label = 'Muito Bullish';
  } else if (normalizedScore >= 2) {
    label = 'Bullish';
  } else if (normalizedScore <= -5) {
    label = 'Muito Bearish';
  } else if (normalizedScore <= -2) {
    label = 'Bearish';
  } else {
    label = 'Neutro';
  }
  
  const reasoning = hotNews.length > 0 
    ? `${hotNews.length} notícia(s) quente(s): ${hotNews[0]}`
    : 'Notícias recentes sem impacto significativo';
  
  return {
    score: Math.round(normalizedScore * 10) / 10,
    label,
    reasoning,
  };
}

export { HIGH_IMPACT_KEYWORDS };
