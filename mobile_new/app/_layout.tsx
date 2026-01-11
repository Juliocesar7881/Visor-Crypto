import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#1E293B',
            borderTopColor: '#334155',
          },
          tabBarActiveTintColor: '#3B82F6',
          tabBarInactiveTintColor: '#64748B',
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Ionicons name={'flash' as any} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="account"
          options={{
            title: 'Conta',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Ionicons name={'wallet' as any} size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </SafeAreaProvider>
  );
}
