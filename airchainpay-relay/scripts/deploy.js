#!/usr/bin/env node

/**
 * AirChainPay Relay - Deployment Script
 * 
 * This script helps deploy the relay server to different environments.
 * Usage:
 *   node scripts/deploy.js [environment] [action]
 * 
 * Environments: dev, staging, prod
 * Actions: setup, deploy, validate, secrets
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

function validateEnvironment(environment) {
  const validEnvironments = ['dev', 'staging', 'prod'];
  if (!validEnvironments.includes(environment)) {
    log(`Error: Invalid environment '${environment}'`, 'red');
    log(`Valid environments: ${validEnvironments.join(', ')}`, 'yellow');
    process.exit(1);
  }
}

function validateAction(action) {
  const validActions = ['setup', 'deploy', 'validate', 'secrets'];
  if (!validActions.includes(action)) {
    log(`Error: Invalid action '${action}'`, 'red');
    log(`Valid actions: ${validActions.join(', ')}`, 'yellow');
    process.exit(1);
  }
}

function checkEnvironmentSetup(environment) {
  const envFile = path.join(__dirname, '..', `.env.${environment}`);
  const templateFile = path.join(__dirname, '..', `env.${environment}`);
  
  if (!fs.existsSync(templateFile)) {
    log(`Error: Template file env.${environment} not found`, 'red');
    log('Run setup first to create environment templates', 'yellow');
    process.exit(1);
  }
  
  if (!fs.existsSync(envFile)) {
    log(`Warning: .env.${environment} file not found`, 'yellow');
    log('Run secrets action to generate environment-specific secrets', 'cyan');
    return false;
  }
  
  return true;
}

function setupEnvironment(environment) {
  log(`\n${colors.bright}Setting up ${environment} environment...${colors.reset}`, 'blue');
  
  // Check if template exists
  const templateFile = path.join(__dirname, '..', `env.${environment}`);
  if (!fs.existsSync(templateFile)) {
    log(`Error: Template file env.${environment} not found`, 'red');
    log('Available templates:', 'yellow');
    const files = fs.readdirSync(path.join(__dirname, '..')).filter(f => f.startsWith('env.'));
    files.forEach(file => log(`  - ${file}`, 'cyan'));
    process.exit(1);
  }
  
  log(`✅ Environment template found: ${templateFile}`, 'green');
  
  // Create .env file from template
  const envFile = path.join(__dirname, '..', `.env.${environment}`);
  const templateContent = fs.readFileSync(templateFile, 'utf8');
  
  // Replace placeholders with environment-specific values
  let content = templateContent;
  
  if (environment === 'dev') {
    content = content.replace(/API_KEY=.*/, 'API_KEY=dev_api_key_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
    content = content.replace(/JWT_SECRET=.*/, 'JWT_SECRET=dev_jwt_secret_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
  }
  
  fs.writeFileSync(envFile, content);
  log(`✅ Created .env.${environment} file`, 'green');
  
  log(`\n${colors.bright}Environment setup complete!${colors.reset}`, 'green');
  log(`Next steps:`, 'yellow');
  log(`1. Review .env.${environment} file`, 'cyan');
  log(`2. Run: node scripts/deploy.js ${environment} secrets`, 'cyan');
  log(`3. Run: node scripts/deploy.js ${environment} validate`, 'cyan');
}

function generateSecrets(environment) {
  log(`\n${colors.bright}Generating secrets for ${environment} environment...${colors.reset}`, 'blue');
  
  try {
    // Run the secrets generation script
    execSync(`node scripts/generate-secrets.js ${environment}`, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    log(`\n${colors.bright}✅ Secrets generated successfully!${colors.reset}`, 'green');
    
  } catch (error) {
    log(`\n${colors.bright}❌ Error generating secrets:${colors.reset}`, 'red');
    log(error.message, 'red');
    process.exit(1);
  }
}

function validateEnvironmentConfig(environment) {
  log(`\n${colors.bright}Validating ${environment} environment configuration...${colors.reset}`, 'blue');
  
  // Check if .env file exists
  const envFile = path.join(__dirname, '..', `.env.${environment}`);
  if (!fs.existsSync(envFile)) {
    log(`Error: .env.${environment} file not found`, 'red');
    log('Run setup and secrets actions first', 'yellow');
    process.exit(1);
  }
  
  log(`✅ Environment file found: ${envFile}`, 'green');
  
  // Load and validate configuration
  try {
    // Set NODE_ENV temporarily for validation
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = environment;
    
    // Load the configuration
    const config = require('../config/default.js');
    
    // Validate required fields
    const requiredFields = ['apiKey', 'jwtSecret', 'rpcUrl', 'chainId', 'contractAddress'];
    const missingFields = requiredFields.filter(field => !config[field]);
    
    if (missingFields.length > 0) {
      log(`❌ Missing required configuration fields:`, 'red');
      missingFields.forEach(field => log(`  - ${field}`, 'red'));
      process.exit(1);
    }
    
    log(`✅ All required configuration fields present`, 'green');
    log(`✅ Configuration validation passed`, 'green');
    
    // Restore original NODE_ENV
    process.env.NODE_ENV = originalNodeEnv;
    
  } catch (error) {
    log(`❌ Configuration validation failed:`, 'red');
    log(error.message, 'red');
    process.exit(1);
  }
}

function deployEnvironment(environment) {
  log(`\n${colors.bright}Deploying to ${environment} environment...${colors.reset}`, 'blue');
  
  // Validate environment first
  if (!checkEnvironmentSetup(environment)) {
    log('Please run setup and secrets actions first', 'yellow');
    process.exit(1);
  }
  
  try {
    // Install dependencies
    log('Installing dependencies...', 'cyan');
    execSync('npm install', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    // Run tests
    log('Running tests...', 'cyan');
    execSync('npm test', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    // Start the server
    log('Starting server...', 'cyan');
    execSync(`NODE_ENV=${environment} npm start`, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
  } catch (error) {
    log(`\n${colors.bright}❌ Deployment failed:${colors.reset}`, 'red');
    log(error.message, 'red');
    process.exit(1);
  }
}

function main() {
  const environment = process.argv[2];
  const action = process.argv[3];
  
  if (!environment || !action) {
    log('Usage: node scripts/deploy.js [environment] [action]', 'yellow');
    log('Environments: dev, staging, prod', 'yellow');
    log('Actions: setup, deploy, validate, secrets', 'yellow');
    log('\nExamples:', 'cyan');
    log('  node scripts/deploy.js dev setup', 'cyan');
    log('  node scripts/deploy.js staging secrets', 'cyan');
    log('  node scripts/deploy.js prod validate', 'cyan');
    log('  node scripts/deploy.js dev deploy', 'cyan');
    process.exit(1);
  }
  
  validateEnvironment(environment);
  validateAction(action);
  
  switch (action) {
    case 'setup':
      setupEnvironment(environment);
      break;
    case 'secrets':
      generateSecrets(environment);
      break;
    case 'validate':
      validateEnvironmentConfig(environment);
      break;
    case 'deploy':
      deployEnvironment(environment);
      break;
    default:
      log(`Unknown action: ${action}`, 'red');
      process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = {
  validateEnvironment,
  validateAction,
  checkEnvironmentSetup,
  setupEnvironment,
  generateSecrets,
  validateEnvironmentConfig,
  deployEnvironment
}; 