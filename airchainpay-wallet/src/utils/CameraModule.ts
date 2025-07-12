import { Platform } from 'react-native';
import { ENABLE_CAMERA_FEATURES } from '../constants/AppConfig';

// Conditionally import Camera to handle cases when the module is not available
let Camera: any;
try {
  if (ENABLE_CAMERA_FEATURES) {
    Camera = require('expo-camera').Camera;
  }
} catch (error) {
  console.warn('[Camera] Failed to import expo-camera:', error);
}

/**
 * Request camera permissions for the app
 * @returns Promise<boolean> - Whether permissions were granted
 */
export async function requestCameraPermissions(): Promise<boolean> {
  // Skip if camera features are disabled
  if (!ENABLE_CAMERA_FEATURES || !Camera) {
    console.log('[Camera] Camera features are disabled in AppConfig');
    return false;
  }
  
  console.log('[Camera] Requesting camera permissions');
  
  try {
    const { status } = await Camera.requestCameraPermissionsAsync();
    console.log('[Camera] Permission status:', status);
    
    return status === 'granted';
  } catch (error) {
    console.error('[Camera] Error requesting permissions:', error);
    return false;
  }
}

/**
 * Check if camera permissions are granted
 * @returns Promise<boolean> - Whether permissions are granted
 */
export async function hasCameraPermissions(): Promise<boolean> {
  // Skip if camera features are disabled
  if (!ENABLE_CAMERA_FEATURES || !Camera) {
    return false;
  }
  
  try {
    const { status } = await Camera.getCameraPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('[Camera] Error checking permissions:', error);
    return false;
  }
}

/**
 * Initialize the camera module
 * This helps prevent camera initialization errors
 */
export async function initializeCameraModule(): Promise<void> {
  // Skip initialization if camera features are disabled
  if (!ENABLE_CAMERA_FEATURES || !Camera) {
    console.log('[Camera] Camera features are disabled in AppConfig');
    return;
  }
  
  try {
    console.log('[Camera] Initializing camera module');
    
    // First request permissions
    await requestCameraPermissions();
    
    // We don't need to check if camera is available since expo-camera doesn't have that API
    // Just log that we've initialized successfully
    console.log('[Camera] Module initialized successfully');
  } catch (error) {
    console.warn('[Camera] Initialization error (non-critical):', error);
    console.log('[Camera] App will continue to function without camera features');
  }
} 