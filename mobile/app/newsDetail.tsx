import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Linking,
  BackHandler,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

interface NewsDetail {
  id: string;
  title: string;
  description: string;
  content: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  impact: 'high' | 'medium' | 'low';
  currencies: string[];
}

export default function NewsDetailScreen() {
  const { id, title, url, source, publishedAt, sentiment, impact, description } = useLocalSearchParams<{
    id: string;
    title: string;
    url: string;
    source: string;
    publishedAt: string;
    sentiment: string;
    impact: string;
    description: string;
  }>();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Handle Android back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.back();
        return true;
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
    }, [router])
  );

  const getSentimentColor = (sent: string) => {
    switch (sent) {
      case 'positive': return '#10B981';
      case 'negative': return '#EF4444';
      default: return '#64748B';
    }
  };

  const getSentimentLabel = (sent: string) => {
    switch (sent) {
      case 'positive': return '📈 Bullish';
      case 'negative': return '📉 Bearish';
      default: return '➖ Neutro';
    }
  };

  const getImpactLabel = (imp: string) => {
    switch (imp) {
      case 'high': return '🔥 Alto Impacto';
      case 'medium': return '⚡ Médio Impacto';
      default: return '📌 Baixo Impacto';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const openExternalLink = () => {
    if (url) {
      Linking.openURL(url);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#F1F5F9" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notícia</Text>
        <TouchableOpacity style={styles.shareButton} onPress={openExternalLink}>
          <Ionicons name="open-outline" size={22} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Source and Date */}
        <View style={styles.metaRow}>
          <Text style={styles.source}>{source || 'Fonte Desconhecida'}</Text>
          <Text style={styles.date}>{formatDate(publishedAt || '')}</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>{title}</Text>

        {/* Badges */}
        <View style={styles.badgesRow}>
          <View style={[styles.badge, { backgroundColor: `${getSentimentColor(sentiment || 'neutral')}20` }]}>
            <Text style={[styles.badgeText, { color: getSentimentColor(sentiment || 'neutral') }]}>
              {getSentimentLabel(sentiment || 'neutral')}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: 'rgba(59, 130, 246, 0.2)' }]}>
            <Text style={[styles.badgeText, { color: '#3B82F6' }]}>
              {getImpactLabel(impact || 'medium')}
            </Text>
          </View>
        </View>

        {/* Description/Content */}
        <View style={styles.contentCard}>
          <Text style={styles.contentText}>
            {description || 'Sem descrição disponível. Clique no botão abaixo para ler a notícia completa.'}
          </Text>
        </View>

        {/* Read Full Article Button */}
        <TouchableOpacity style={styles.readMoreButton} onPress={openExternalLink}>
          <Ionicons name="newspaper-outline" size={20} color="#F1F5F9" />
          <Text style={styles.readMoreText}>Ler Notícia Completa</Text>
          <Ionicons name="chevron-forward" size={20} color="#F1F5F9" />
        </TouchableOpacity>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            ⚠️ Esta notícia é apenas para fins informativos. Sempre faça sua própria pesquisa antes de tomar decisões de investimento.
          </Text>
        </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F1F5F9',
  },
  shareButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  source: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
  },
  date: {
    fontSize: 12,
    color: '#64748B',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#F1F5F9',
    lineHeight: 32,
    marginBottom: 16,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  contentCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  contentText: {
    fontSize: 16,
    color: '#94A3B8',
    lineHeight: 26,
  },
  readMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  readMoreText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  disclaimer: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.2)',
  },
  disclaimerText: {
    fontSize: 13,
    color: '#FBBF24',
    lineHeight: 20,
    textAlign: 'center',
  },
});
