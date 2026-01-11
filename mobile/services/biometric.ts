import * as LocalAuthentication from 'expo-local-authentication';

export const biometricService = {
  async isAvailable(): Promise<boolean> {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  },

  async authenticate(reason: string = 'Autentique-se para continuar'): Promise<boolean> {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancelar',
      fallbackLabel: 'Usar senha',
    });
    return result.success;
  },
};
