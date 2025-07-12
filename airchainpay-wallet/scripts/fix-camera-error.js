/**
 * Camera Error Fix Script
 * 
 * This script helps fix the "Failed to initialize VisionCamera" error
 * by modifying the app configuration to disable camera features.
 */

const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

// Get the directory name
const currentDir = path.dirname(process.argv[1]);

// Path to the AppConfig.ts file
const configPath = path.join(currentDir, '../src/constants/AppConfig.ts');

// Read the current content of the file
try {
  console.log('Reading AppConfig.ts...');
  let content = fs.readFileSync(configPath, 'utf8');
  
  // Replace the camera config to disable it
  content = content.replace(
    /export const ENABLE_CAMERA_FEATURES = (true|false);/,
    'export const ENABLE_CAMERA_FEATURES = false;'
  );
  
  // Write the updated content back to the file
  console.log('Updating AppConfig.ts to disable camera features...');
  fs.writeFileSync(configPath, content, 'utf8');
  
  console.log('✅ Camera features disabled successfully!');
  console.log('');
  console.log('To run the app:');
  console.log('1. Make sure you are in the airchainpay-wallet directory');
  console.log('2. Run: npx expo start');
  console.log('');
  console.log('If you still encounter issues:');
  console.log('1. Run: npm run clean');
  console.log('2. Then: npx expo start');
} catch (error) {
  console.error('❌ Error updating AppConfig.ts:', error.message);
} 