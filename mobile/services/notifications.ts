import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiService } from './api';

// Try to import expo-device, fallback if not available
let Device: any = null;
try {
  Device = require('expo-device');
} catch (error) {
  console.warn('expo-device not available, notifications may be limited');
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const notificationService = {
  async requestPermissionsAndRegister(): Promise<string | null> {
    if (Device && !Device.isDevice) {
      console.warn('Notificações push não funcionam em simuladores/emuladores.');
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      alert('Permissão de notificações negada.');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'your-expo-project-id', // Substitua pelo seu ID do Expo
    });

    const token = tokenData.data;
    await apiService.registerDevice(token);

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('trade-alerts', {
        name: 'Alertas de Trade',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
      });
    }

    return token;
  },

  addNotificationReceivedListener(handler: (notification: Notifications.Notification) => void) {
    return Notifications.addNotificationReceivedListener(handler);
  },

  addNotificationResponseListener(handler: (response: Notifications.NotificationResponse) => void) {
    return Notifications.addNotificationResponseReceivedListener(handler);
  },
};
