import React from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { initializeCameraModule } from '../utils/CameraModule';

interface CameraErrorFallbackProps {
  error: Error | null;
  onRetry?: () => void;
}

/**
 * A fallback component to display when there's a camera error
 */
export function CameraErrorFallback({ error, onRetry }: CameraErrorFallbackProps) {
  const handleRetry = async () => {
    try {
      // Try to initialize the camera module again
      await initializeCameraModule();
      
      // Call the onRetry callback if provided
      if (onRetry) {
        onRetry();
      }
    } catch (e) {
      console.error('Failed to retry camera initialization:', e);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Camera Not Available</Text>
      <Text style={styles.message}>
        The camera feature is not available or permissions were denied.
      </Text>
      {error && (
        <Text style={styles.error}>
          Error: {error.message}
        </Text>
      )}
      <View style={styles.buttonContainer}>
        <Button title="Try Again" onPress={handleRetry} />
      </View>
      <Text style={styles.note}>
        Note: You can still use the app without camera functionality.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    margin: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  error: {
    fontSize: 12,
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 16,
  },
  buttonContainer: {
    marginVertical: 16,
  },
  note: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
}); 