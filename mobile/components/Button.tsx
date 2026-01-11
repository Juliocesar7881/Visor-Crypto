import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function Button({ title, onPress, variant = 'primary', loading, disabled, style }: ButtonProps) {
  const bgColor = variant === 'danger' ? '#EF4444' : '#3B82F6';

  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: bgColor, opacity: disabled ? 0.5 : 1 }, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.text}>{title}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
