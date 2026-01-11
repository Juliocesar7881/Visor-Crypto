import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function RootLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#0F172A' },
        headerTintColor: '#F1F5F9',
        headerTitleStyle: { fontWeight: 'bold' },
        tabBarStyle: {
          backgroundColor: '#1E293B',
          borderTopColor: '#334155',
          borderTopWidth: 1,
          height: 62,
          paddingBottom: 10,
          paddingTop: 10,
        },
        tabBarActiveTintColor: '#3B82F6',
        tabBarInactiveTintColor: '#64748B',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: 'Notícias',
          headerShown: false,
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="newspaper" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="macro"
        options={{
          title: 'Macro',
          headerShown: false,
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="trending-up" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Mercado',
          headerShown: false,
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="stats-chart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Conta',
          headerShown: false,
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="wallet" size={size} color={color} />
          ),
        }}
      />
      {/* Hidden screens - not in tab bar */}
      <Tabs.Screen
        name="charts"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="chartDetail"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="newsDetail"
        options={{
          href: null,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
