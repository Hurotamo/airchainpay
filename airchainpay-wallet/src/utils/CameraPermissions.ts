import { requestCameraPermissions, hasCameraPermissions } from './CameraModule';

export class CameraPermissions {
  static async requestCameraPermission(): Promise<boolean> {
    try {
      // Use the CameraModule utility to request permissions
      return await requestCameraPermissions();
    } catch (error) {
      console.error('Camera permission error:', error);
      return false;
    }
  }

  static async checkCameraPermission(): Promise<boolean> {
    // Use the CameraModule utility to check permissions
    try {
      return await hasCameraPermissions();
    } catch (error) {
      console.error('Camera permission check error:', error);
      return false;
    }
  }
} 