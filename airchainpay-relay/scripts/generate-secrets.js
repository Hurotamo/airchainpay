#!/usr/bin/env node

/**
 * AirChainPay Relay - Secret Generation Script
 * 
 * This script generates secure secrets for different environments.
 * Usage:
 *   node scripts/generate-secrets.js [environment]
 * 
 * Environments: dev, staging, prod
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function generateSecureSecret(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

function generateApiKey() {
  return generateSecureSecret(32);
}

function generateJwtSecret() {
  return generateSecureSecret(64);
}

function generateEnvironmentSecrets(environment) {
  const secrets = {
    apiKey: generateApiKey(),
    jwtSecret: generateJwtSecret()
  };

  log(`\n${colors.bright}Generated secrets for ${environment} environment:${colors.reset}`, 'green');
  log(`API_KEY=${secrets.apiKey}`, 'cyan');
  log(`JWT_SECRET=${secrets.jwtSecret}`, 'cyan');
  
  return secrets;
}

function updateEnvironmentFile(environment, secrets) {
  const envFile = path.join(__dirname, '..', `env.${environment}`);
  const envContent = fs.readFileSync(envFile, 'utf8');
  
  // Replace placeholders with generated secrets
  let updatedContent = envContent
    .replace(/API_KEY=.*/, `API_KEY=${secrets.apiKey}`)
    .replace(/JWT_SECRET=.*/, `JWT_SECRET=${secrets.jwtSecret}`);
  
  // Write updated content back to file
  fs.writeFileSync(envFile, updatedContent);
  
  log(`\n${colors.bright}Updated ${envFile} with new secrets${colors.reset}`, 'green');
}

function createEnvFile(environment, secrets) {
  const envFile = path.join(__dirname, '..', `.env.${environment}`);
  
  // Read the template file
  const templateFile = path.join(__dirname, '..', `env.${environment}`);
  let content = fs.readFileSync(templateFile, 'utf8');
  
  // Replace placeholders with generated secrets
  content = content
    .replace(/API_KEY=.*/, `API_KEY=${secrets.apiKey}`)
    .replace(/JWT_SECRET=.*/, `JWT_SECRET=${secrets.jwtSecret}`);
  
  // Write the actual .env file
  fs.writeFileSync(envFile, content);
  
  log(`\n${colors.bright}Created ${envFile} with generated secrets${colors.reset}`, 'green');
}

function validateEnvironment(environment) {
  const validEnvironments = ['dev', 'staging', 'prod'];
  if (!validEnvironments.includes(environment)) {
    log(`Error: Invalid environment '${environment}'`, 'red');
    log(`Valid environments: ${validEnvironments.join(', ')}`, 'yellow');
    process.exit(1);
  }
}

function main() {
  const environment = process.argv[2];
  
  if (!environment) {
    log('Usage: node scripts/generate-secrets.js [environment]', 'yellow');
    log('Environments: dev, staging, prod', 'yellow');
    log('\nExample:', 'cyan');
    log('  node scripts/generate-secrets.js dev', 'cyan');
    log('  node scripts/generate-secrets.js staging', 'cyan');
    log('  node scripts/generate-secrets.js prod', 'cyan');
    process.exit(1);
  }
  
  validateEnvironment(environment);
  
  log(`\n${colors.bright}Generating secrets for ${environment} environment...${colors.reset}`, 'blue');
  
  try {
    // Generate secrets
    const secrets = generateEnvironmentSecrets(environment);
    
    // Update the template file
    updateEnvironmentFile(environment, secrets);
    
    // Create the actual .env file
    createEnvFile(environment, secrets);
    
    log(`\n${colors.bright}✅ Secrets generated successfully for ${environment} environment!${colors.reset}`, 'green');
    log(`\nNext steps:`, 'yellow');
    log(`1. Review the generated secrets in .env.${environment}`, 'cyan');
    log(`2. Update your deployment configuration`, 'cyan');
    log(`3. Store secrets securely (not in version control)`, 'cyan');
    
    if (environment === 'prod') {
      log(`\n${colors.bright}⚠️  PRODUCTION SECURITY REMINDERS:${colors.reset}`, 'red');
      log(`• Rotate secrets regularly`, 'yellow');
      log(`• Use secure secret management (AWS Secrets Manager, etc.)`, 'yellow');
      log(`• Monitor for unauthorized access`, 'yellow');
      log(`• Never commit .env files to version control`, 'yellow');
    }
    
  } catch (error) {
    log(`\n${colors.bright}❌ Error generating secrets:${colors.reset}`, 'red');
    log(error.message, 'red');
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = {
  generateApiKey,
  generateJwtSecret,
  generateEnvironmentSecrets
}; 