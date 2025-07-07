#!/usr/bin/env node

/**
 * AirChainPay Relay - Docker Deployment Script
 * 
 * This script helps deploy the relay server using Docker for different environments.
 * Usage:
 *   node scripts/docker-deploy.js [environment] [action]
 * 
 * Environments: dev, staging, prod
 * Actions: build, start, stop, restart, logs, shell
 */

const { execSync } = require('child_process');
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

function validateEnvironment(environment) {
  const validEnvironments = ['dev', 'staging', 'prod'];
  if (!validEnvironments.includes(environment)) {
    log(`Error: Invalid environment '${environment}'`, 'red');
    log(`Valid environments: ${validEnvironments.join(', ')}`, 'yellow');
    process.exit(1);
  }
}

function validateAction(action) {
  const validActions = ['build', 'start', 'stop', 'restart', 'logs', 'shell', 'clean'];
  if (!validActions.includes(action)) {
    log(`Error: Invalid action '${action}'`, 'red');
    log(`Valid actions: ${validActions.join(', ')}`, 'yellow');
    process.exit(1);
  }
}

function checkEnvironmentFiles(environment) {
  const envFile = path.join(__dirname, '..', `.env.${environment}`);
  const composeFile = path.join(__dirname, '..', `docker-compose.${environment}.yml`);
  
  if (!fs.existsSync(envFile)) {
    log(`Warning: .env.${environment} file not found`, 'yellow');
    log(`Run: node scripts/deploy.js ${environment} secrets`, 'cyan');
  }
  
  if (!fs.existsSync(composeFile)) {
    log(`Error: docker-compose.${environment}.yml not found`, 'red');
    process.exit(1);
  }
  
  return true;
}

function getContainerName(environment) {
  const containerNames = {
    dev: 'airchainpay-relay-dev',
    staging: 'airchainpay-relay-staging',
    prod: 'airchainpay-relay-prod'
  };
  return containerNames[environment];
}

function buildDockerImage(environment) {
  log(`\n${colors.bright}Building Docker image for ${environment} environment...${colors.reset}`, 'blue');
  
  try {
    const composeFile = `docker-compose.${environment}.yml`;
    execSync(`docker-compose -f ${composeFile} build`, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    log(`\n${colors.bright}✅ Docker image built successfully!${colors.reset}`, 'green');
    
  } catch (error) {
    log(`\n${colors.bright}❌ Docker build failed:${colors.reset}`, 'red');
    log(error.message, 'red');
    process.exit(1);
  }
}

function startDockerContainer(environment) {
  log(`\n${colors.bright}Starting Docker container for ${environment} environment...${colors.reset}`, 'blue');
  
  try {
    const composeFile = `docker-compose.${environment}.yml`;
    execSync(`docker-compose -f ${composeFile} up -d`, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    log(`\n${colors.bright}✅ Docker container started successfully!${colors.reset}`, 'green');
    log(`Container name: ${getContainerName(environment)}`, 'cyan');
    log(`Port: 4000`, 'cyan');
    
  } catch (error) {
    log(`\n${colors.bright}❌ Docker start failed:${colors.reset}`, 'red');
    log(error.message, 'red');
    process.exit(1);
  }
}

function stopDockerContainer(environment) {
  log(`\n${colors.bright}Stopping Docker container for ${environment} environment...${colors.reset}`, 'blue');
  
  try {
    const composeFile = `docker-compose.${environment}.yml`;
    execSync(`docker-compose -f ${composeFile} down`, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    log(`\n${colors.bright}✅ Docker container stopped successfully!${colors.reset}`, 'green');
    
  } catch (error) {
    log(`\n${colors.bright}❌ Docker stop failed:${colors.reset}`, 'red');
    log(error.message, 'red');
    process.exit(1);
  }
}

function restartDockerContainer(environment) {
  log(`\n${colors.bright}Restarting Docker container for ${environment} environment...${colors.reset}`, 'blue');
  
  try {
    const composeFile = `docker-compose.${environment}.yml`;
    execSync(`docker-compose -f ${composeFile} restart`, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    log(`\n${colors.bright}✅ Docker container restarted successfully!${colors.reset}`, 'green');
    
  } catch (error) {
    log(`\n${colors.bright}❌ Docker restart failed:${colors.reset}`, 'red');
    log(error.message, 'red');
    process.exit(1);
  }
}

function showDockerLogs(environment) {
  log(`\n${colors.bright}Showing logs for ${environment} environment...${colors.reset}`, 'blue');
  
  try {
    const containerName = getContainerName(environment);
    execSync(`docker logs -f ${containerName}`, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
  } catch (error) {
    log(`\n${colors.bright}❌ Failed to show logs:${colors.reset}`, 'red');
    log(error.message, 'red');
    process.exit(1);
  }
}

function shellIntoContainer(environment) {
  log(`\n${colors.bright}Opening shell in ${environment} container...${colors.reset}`, 'blue');
  
  try {
    const containerName = getContainerName(environment);
    execSync(`docker exec -it ${containerName} /bin/sh`, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
  } catch (error) {
    log(`\n${colors.bright}❌ Failed to open shell:${colors.reset}`, 'red');
    log(error.message, 'red');
    process.exit(1);
  }
}

function cleanDockerResources(environment) {
  log(`\n${colors.bright}Cleaning Docker resources for ${environment} environment...${colors.reset}`, 'blue');
  
  try {
    const composeFile = `docker-compose.${environment}.yml`;
    execSync(`docker-compose -f ${composeFile} down --volumes --remove-orphans`, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    log(`\n${colors.bright}✅ Docker resources cleaned successfully!${colors.reset}`, 'green');
    
  } catch (error) {
    log(`\n${colors.bright}❌ Docker clean failed:${colors.reset}`, 'red');
    log(error.message, 'red');
    process.exit(1);
  }
}

function main() {
  const environment = process.argv[2];
  const action = process.argv[3];
  
  if (!environment || !action) {
    log('Usage: node scripts/docker-deploy.js [environment] [action]', 'yellow');
    log('Environments: dev, staging, prod', 'yellow');
    log('Actions: build, start, stop, restart, logs, shell, clean', 'yellow');
    log('\nExamples:', 'cyan');
    log('  node scripts/docker-deploy.js dev build', 'cyan');
    log('  node scripts/docker-deploy.js staging start', 'cyan');
    log('  node scripts/docker-deploy.js prod logs', 'cyan');
    log('  node scripts/docker-deploy.js dev shell', 'cyan');
    process.exit(1);
  }
  
  validateEnvironment(environment);
  validateAction(action);
  checkEnvironmentFiles(environment);
  
  switch (action) {
    case 'build':
      buildDockerImage(environment);
      break;
    case 'start':
      startDockerContainer(environment);
      break;
    case 'stop':
      stopDockerContainer(environment);
      break;
    case 'restart':
      restartDockerContainer(environment);
      break;
    case 'logs':
      showDockerLogs(environment);
      break;
    case 'shell':
      shellIntoContainer(environment);
      break;
    case 'clean':
      cleanDockerResources(environment);
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
  checkEnvironmentFiles,
  buildDockerImage,
  startDockerContainer,
  stopDockerContainer,
  restartDockerContainer,
  showDockerLogs,
  shellIntoContainer,
  cleanDockerResources
}; 