import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, RefreshControl, TouchableOpacity, BackHandler, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { fetchHotNews, XNews } from '../services/xNewsService';

interface NewsItem {
  id: string;
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  impact: 'high' | 'medium' | 'low';
  isHot?: boolean; // Notícia quente do X
}

type FilterType = 'all' | 'positive' | 'negative' | 'hot';

export default function NewsScreen() {
  const router = useRouter();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [hotNews, setHotNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  // Handle Android back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [])
  );

  useEffect(() => {
    loadNews();
    loadHotNews();
  }, []);

  const loadHotNews = async () => {
    try {
      const xNews = await fetchHotNews();
      const formattedHotNews: NewsItem[] = xNews.map((item: XNews) => ({
        id: `hot_${item.id}`,
        title: item.text,
        description: `Via @${item.authorHandle} (${item.author})`,
        source: `X: @${item.authorHandle}`,
        url: `https://x.com/${item.authorHandle}`,
        publishedAt: item.timestamp,
        sentiment: item.sentiment === 'bullish' ? 'positive' : item.sentiment === 'bearish' ? 'negative' : 'neutral',
        impact: item.impact,
        isHot: true,
      }));
      setHotNews(formattedHotNews);
    } catch (error) {
      console.error('Erro ao carregar notícias quentes:', error);
    }
  };

  const loadNews = async () => {
    setLoading(true);
    try {
      const CRYPTOPANIC_API_KEY = 'c27c1e2c81c1a7a9b8c7e8f9d0a1b2c3d4e5f6a7';
      const response = await fetch(
        `https://cryptopanic.com/api/v1/posts/?auth_token=${CRYPTOPANIC_API_KEY}&public=true&kind=news&filter=rising`,
        {
          headers: {
            'Accept': 'application/json',
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      const fifteenDaysAgo = new Date();
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
      
      const formattedNews: NewsItem[] = (data.results || [])
        .map((item: any, index: number) => {
          let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
          if (item.votes) {
            const positive = item.votes.positive || 0;
            const negative = item.votes.negative || 0;
            if (positive > negative + 2) sentiment = 'positive';
            else if (negative > positive + 2) sentiment = 'negative';
          }
          
          let impact: 'high' | 'medium' | 'low' = 'low';
          if (item.votes) {
            const likes = item.votes.liked || 0;
            const important = item.votes.important || 0;
            if (important > 3 || likes > 10) impact = 'high';
            else if (important > 1 || likes > 5) impact = 'medium';
          }
          
          return {
            id: item.id?.toString() || String(index + 1),
            title: item.title,
            description: item.metadata?.description || 'Toque para ver mais detalhes.',
            source: item.source?.title || item.domain || 'CryptoPanic',
            url: item.url || '',
            publishedAt: item.published_at || item.created_at || new Date().toISOString(),
            sentiment,
            impact,
            isHot: false,
          };
        })
        .filter((item: NewsItem) => {
          const publishDate = new Date(item.publishedAt);
          return publishDate >= fifteenDaysAgo;
        })
        .slice(0, 200);
      
      if (formattedNews.length > 0) {
        setNews(formattedNews);
      } else {
        throw new Error('No news available');
      }
    } catch (error) {
      console.error('Erro ao carregar notícias:', error);
      // Fallback com dados simulados
      const now = new Date();
      const fallbackNews: NewsItem[] = [];
      
      const templates = [
        { title: 'Bitcoin ultrapassa $45.000 após decisão do Fed', description: 'O Federal Reserve manteve as taxas de juros.', source: 'CoinDesk', sentiment: 'positive' as const, impact: 'high' as const },
        { title: 'Ethereum 2.0 completa 90% das validações', description: 'A rede Ethereum está próxima da transição para PoS.', source: 'CryptoNews', sentiment: 'positive' as const, impact: 'medium' as const },
        { title: 'SEC anuncia novas regulações para exchanges', description: 'Reguladores estabelecem diretrizes mais rígidas.', source: 'Bloomberg', sentiment: 'negative' as const, impact: 'high' as const },
        { title: 'Solana anuncia parceria com Visa', description: 'Parceria para pagamentos instantâneos.', source: 'The Block', sentiment: 'positive' as const, impact: 'medium' as const },
        { title: 'Volume de trading aumenta 120% em 24h', description: 'Aumento significativo de volume.', source: 'CoinTelegraph', sentiment: 'neutral' as const, impact: 'medium' as const },
        { title: 'BlackRock aumenta participação em ETF de Bitcoin', description: 'Maior gestor aposta em cripto.', source: 'Reuters', sentiment: 'positive' as const, impact: 'high' as const },
      ];
      
      for (let i = 0; i < 30; i++) {
        const template = templates[i % templates.length];
        const hoursAgo = Math.floor((i / 30) * 360);
        fallbackNews.push({
          id: String(i + 1),
          title: template.title,
          description: template.description,
          source: template.source,
          url: `https://${template.source.toLowerCase().replace(' ', '')}.com`,
          publishedAt: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString(),
          sentiment: template.sentiment,
          impact: template.impact,
          isHot: false,
        });
      }
      
      setNews(fallbackNews);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setLoading(true);
    await Promise.all([loadNews(), loadHotNews()]);
    setLoading(false);
  };

  const getFilteredNews = (): NewsItem[] => {
    switch (activeFilter) {
      case 'positive':
        return news.filter(n => n.sentiment === 'positive');
      case 'negative':
        return news.filter(n => n.sentiment === 'negative');
      case 'hot':
        return hotNews;
      default:
        return news;
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return '#10B981';
      case 'negative': return '#EF4444';
      default: return '#64748B';
    }
  };

  const getImpactEmoji = (impact: string, isHot?: boolean) => {
    if (isHot) return '🔥';
    switch (impact) {
      case 'high': return '🔥';
      case 'medium': return '⚡';
      default: return '📌';
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000 / 60);
    
    if (diff < 60) return `${diff}m atrás`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h atrás`;
    const days = Math.floor(diff / 1440);
    if (days === 1) return '1 dia atrás';
    return `${days} dias atrás`;
  };

  const openNews = (item: NewsItem) => {
    router.push({
      pathname: '/newsDetail',
      params: {
        id: item.id,
        title: item.title,
        url: item.url,
        source: item.source,
        publishedAt: item.publishedAt,
        sentiment: item.sentiment,
        impact: item.impact,
        description: item.description,
      },
    });
  };

  const filteredNews = getFilteredNews();

  const filterButtons: { key: FilterType; label: string; emoji: string }[] = [
    { key: 'all', label: 'Todas', emoji: '📰' },
    { key: 'positive', label: 'Positivas', emoji: '🟢' },
    { key: 'negative', label: 'Negativas', emoji: '🔴' },
    { key: 'hot', label: 'Quentes', emoji: '🔥' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      
      <View style={styles.header}>
        <Text style={styles.title}>📰 Notícias Cripto</Text>
        <Text style={styles.subtitle}>Últimas atualizações do mercado</Text>
      </View>

      {/* Filtros */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {filterButtons.map((filter) => (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.filterButton,
                activeFilter === filter.key && styles.filterButtonActive,
                filter.key === 'hot' && styles.filterButtonHot,
              ]}
              onPress={() => setActiveFilter(filter.key)}
            >
              <Text style={styles.filterEmoji}>{filter.emoji}</Text>
              <Text style={[
                styles.filterLabel,
                activeFilter === filter.key && styles.filterLabelActive,
              ]}>
                {filter.label}
              </Text>
              {filter.key === 'hot' && hotNews.length > 0 && (
                <View style={styles.hotBadge}>
                  <Text style={styles.hotBadgeText}>{hotNews.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Banner para notícias quentes */}
      {activeFilter === 'hot' && (
        <View style={styles.hotBanner}>
          <Text style={styles.hotBannerText}>
            🔥 Notícias de alto impacto de @DeItaone, @Tier10k, @FirstSquawk e outros
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
      >
        {loading && filteredNews.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Carregando notícias...</Text>
          </View>
        ) : filteredNews.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyText}>Nenhuma notícia encontrada</Text>
            <Text style={styles.emptySubtext}>
              {activeFilter === 'hot' 
                ? 'Não há notícias quentes no momento' 
                : 'Tente outro filtro ou atualize'}
            </Text>
          </View>
        ) : (
          <>
            {filteredNews.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.newsCard,
                  item.isHot && styles.newsCardHot,
                ]}
                onPress={() => openNews(item)}
                activeOpacity={0.7}
              >
                <View style={styles.newsHeader}>
                  <View style={styles.metaInfo}>
                    <Text style={[
                      styles.source,
                      item.isHot && styles.sourceHot,
                    ]}>
                      {item.source}
                    </Text>
                    <Text style={styles.time}>{formatTime(item.publishedAt)}</Text>
                  </View>
                  <View style={styles.badges}>
                    <Text style={styles.impactBadge}>{getImpactEmoji(item.impact, item.isHot)}</Text>
                    <View style={[styles.sentimentBadge, { backgroundColor: getSentimentColor(item.sentiment) }]} />
                  </View>
                </View>

                <Text style={styles.newsTitle}>{item.title}</Text>
                <Text style={styles.newsDescription}>{item.description}</Text>

                <View style={styles.footer}>
                  <Text style={styles.readMore}>
                    {item.isHot ? 'Ver no X →' : 'Ler mais →'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            <View style={styles.disclaimer}>
              <Text style={styles.disclaimerText}>
                {activeFilter === 'hot' 
                  ? '🔥 Notícias de alto impacto dos principais perfis do X'
                  : '💡 Até 200 notícias dos últimos 15 dias'}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F1F5F9',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    marginRight: 10,
    gap: 6,
  },
  filterButtonActive: {
    backgroundColor: '#3B82F6',
  },
  filterButtonHot: {
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  filterEmoji: {
    fontSize: 14,
  },
  filterLabel: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  filterLabelActive: {
    color: '#F1F5F9',
  },
  hotBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
  },
  hotBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  hotBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: 10,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  hotBannerText: {
    color: '#FCA5A5',
    fontSize: 12,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: '#64748B',
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    color: '#F1F5F9',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#64748B',
    fontSize: 14,
  },
  newsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  newsCardHot: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  newsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  metaInfo: {
    flex: 1,
  },
  source: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '600',
    marginBottom: 4,
  },
  sourceHot: {
    color: '#EF4444',
  },
  time: {
    fontSize: 11,
    color: '#64748B',
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  impactBadge: {
    fontSize: 18,
  },
  sentimentBadge: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  newsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F1F5F9',
    marginBottom: 8,
    lineHeight: 22,
  },
  newsDescription: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  readMore: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '600',
  },
  disclaimer: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  disclaimerText: {
    fontSize: 13,
    color: '#60A5FA',
    textAlign: 'center',
    lineHeight: 18,
  },
});
