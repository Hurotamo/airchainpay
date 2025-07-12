#!/usr/bin/env node

/**
 * Ethers.js Dependency Fix Script
 * 
 * This script helps fix dependency issues with ethers.js in React Native/Expo projects
 * by creating necessary shims and patching problematic imports.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Setting up ethers.js dependency fixes...');

// Get the script directory
const scriptDir = path.dirname(process.argv[1]);
const projectRoot = path.join(scriptDir, '..');
const nodeModulesDir = path.join(projectRoot, 'node_modules');

// Create shim directory if it doesn't exist
const shimDir = path.join(projectRoot, 'src', 'shims');
if (!fs.existsSync(shimDir)) {
  fs.mkdirSync(shimDir, { recursive: true });
  console.log(`✅ Created shim directory at ${shimDir}`);
}

// Create crypto.js shim
const cryptoShimPath = path.join(shimDir, 'crypto.js');
const cryptoShimContent = `
// Crypto shim for ethers.js in React Native
// This provides minimal implementations of crypto functions needed by ethers

export default {
  getRandomValues: function(buffer) {
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
    return buffer;
  }
};
`;

try {
  fs.writeFileSync(cryptoShimPath, cryptoShimContent, 'utf8');
  console.log(`✅ Created crypto shim at ${cryptoShimPath}`);
} catch (error) {
  console.error(`❌ Error creating crypto shim: ${error.message}`);
}

// Create ens-normalize shim
const ensNormalizeShimPath = path.join(shimDir, 'ens-normalize.js');
const ensNormalizeShimContent = `
// ENS Normalize shim for ethers.js in React Native
// This provides minimal implementations needed by ethers

export function ens_normalize(name) {
  // Simple passthrough for now
  return name;
}

export default {
  ens_normalize
};
`;

try {
  fs.writeFileSync(ensNormalizeShimPath, ensNormalizeShimContent, 'utf8');
  console.log(`✅ Created ENS normalize shim at ${ensNormalizeShimPath}`);
} catch (error) {
  console.error(`❌ Error creating ENS normalize shim: ${error.message}`);
}

// Create babel.config.js with module-resolver to fix imports
const babelConfigPath = path.join(projectRoot, 'babel.config.js');
const babelConfigContent = `
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Add module resolver for problematic imports
      [
        'module-resolver',
        {
          alias: {
            // Use our shims for problematic modules
            'crypto': './src/shims/crypto.js',
            '@adraffy/ens-normalize': './src/shims/ens-normalize.js',
            '@noble/hashes/crypto': './src/shims/crypto.js'
          }
        }
      ]
    ]
  };
};
`;

try {
  fs.writeFileSync(babelConfigPath, babelConfigContent, 'utf8');
  console.log(`✅ Updated babel config at ${babelConfigPath}`);
} catch (error) {
  console.error(`❌ Error updating babel config: ${error.message}`);
}

// Install required packages
console.log('\n📦 Installing required dependencies...');
try {
  execSync('npm install babel-plugin-module-resolver --save-dev --legacy-peer-deps', { 
    cwd: projectRoot,
    stdio: 'inherit'
  });
  console.log('✅ Installed babel-plugin-module-resolver');
} catch (error) {
  console.error(`❌ Error installing dependencies: ${error.message}`);
}

console.log('\n✨ Setup complete! Now run: npm run start-fixed'); 