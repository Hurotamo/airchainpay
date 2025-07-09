#!/usr/bin/env node

/**
 * Test script for Swagger/OpenAPI integration
 * Verifies that API documentation is properly generated and accessible
 */

const { expect } = require('chai');
const swaggerJsdoc = require('swagger-jsdoc');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Swagger/OpenAPI Integration...\n');

function testSwaggerConfiguration() {
  console.log('📋 Testing Swagger Configuration...');
  
  try {
    // Test that swagger.js exists and exports specs
    const swaggerPath = path.join(__dirname, '../../src/swagger.js');
    expect(fs.existsSync(swaggerPath)).to.be.true;
    
    const swaggerSpec = require(swaggerPath);
    expect(swaggerSpec).to.be.an('object');
    expect(swaggerSpec.openapi).to.equal('3.0.0');
    
    console.log('✅ Swagger configuration file exists and exports specs');
    return true;
  } catch (error) {
    console.error('❌ Swagger configuration test failed:', error.message);
    return false;
  }
}

function testSwaggerInfo() {
  console.log('📋 Testing Swagger Info...');
  
  try {
    const swaggerSpec = require('../../src/swagger.js');
    
    // Test basic info
    expect(swaggerSpec.info).to.be.an('object');
    expect(swaggerSpec.info.title).to.equal('AirChainPay Relay API');
    expect(swaggerSpec.info.version).to.equal('1.0.0');
    expect(swaggerSpec.info.description).to.include('AirChainPay relay server');
    
    // Test contact info
    expect(swaggerSpec.info.contact).to.be.an('object');
    expect(swaggerSpec.info.contact.name).to.equal('AirChainPay Support');
    expect(swaggerSpec.info.contact.email).to.equal('support@airchainpay.com');
    
    // Test license
    expect(swaggerSpec.info.license).to.be.an('object');
    expect(swaggerSpec.info.license.name).to.equal('MIT');
    
    console.log('✅ Swagger info is properly configured');
    return true;
  } catch (error) {
    console.error('❌ Swagger info test failed:', error.message);
    return false;
  }
}

function testSwaggerServers() {
  console.log('📋 Testing Swagger Servers...');
  
  try {
    const swaggerSpec = require('../../src/swagger.js');
    
    expect(swaggerSpec.servers).to.be.an('array');
    expect(swaggerSpec.servers).to.have.lengthOf(2);
    
    // Test development server
    expect(swaggerSpec.servers[0].url).to.equal('http://localhost:4000');
    expect(swaggerSpec.servers[0].description).to.equal('Development server');
    
    // Test production server
    expect(swaggerSpec.servers[1].url).to.equal('https://relay.airchainpay.com');
    expect(swaggerSpec.servers[1].description).to.equal('Production server');
    
    console.log('✅ Swagger servers are properly configured');
    return true;
  } catch (error) {
    console.error('❌ Swagger servers test failed:', error.message);
    return false;
  }
}

function testSwaggerSecuritySchemes() {
  console.log('📋 Testing Swagger Security Schemes...');
  
  try {
    const swaggerSpec = require('../../src/swagger.js');
    
    expect(swaggerSpec.components.securitySchemes).to.be.an('object');
    
    // Test BearerAuth
    expect(swaggerSpec.components.securitySchemes.BearerAuth).to.be.an('object');
    expect(swaggerSpec.components.securitySchemes.BearerAuth.type).to.equal('http');
    expect(swaggerSpec.components.securitySchemes.BearerAuth.scheme).to.equal('bearer');
    expect(swaggerSpec.components.securitySchemes.BearerAuth.bearerFormat).to.equal('JWT');
    
    // Test ApiKeyAuth
    expect(swaggerSpec.components.securitySchemes.ApiKeyAuth).to.be.an('object');
    expect(swaggerSpec.components.securitySchemes.ApiKeyAuth.type).to.equal('apiKey');
    expect(swaggerSpec.components.securitySchemes.ApiKeyAuth.in).to.equal('header');
    expect(swaggerSpec.components.securitySchemes.ApiKeyAuth.name).to.equal('X-API-Key');
    
    console.log('✅ Swagger security schemes are properly configured');
    return true;
  } catch (error) {
    console.error('❌ Swagger security schemes test failed:', error.message);
    return false;
  }
}

function testSwaggerSchemas() {
  console.log('📋 Testing Swagger Schemas...');
  
  try {
    const swaggerSpec = require('../../src/swagger.js');
    
    expect(swaggerSpec.components.schemas).to.be.an('object');
    
    // Test Transaction schema
    expect(swaggerSpec.components.schemas.Transaction).to.be.an('object');
    expect(swaggerSpec.components.schemas.Transaction.type).to.equal('object');
    expect(swaggerSpec.components.schemas.Transaction.properties).to.be.an('object');
    expect(swaggerSpec.components.schemas.Transaction.required).to.include('signedTransaction');
    expect(swaggerSpec.components.schemas.Transaction.required).to.include('chainId');
    
    // Test TransactionResponse schema
    expect(swaggerSpec.components.schemas.TransactionResponse).to.be.an('object');
    expect(swaggerSpec.components.schemas.TransactionResponse.properties.success).to.be.an('object');
    expect(swaggerSpec.components.schemas.TransactionResponse.properties.hash).to.be.an('object');
    
    // Test BLEStatus schema
    expect(swaggerSpec.components.schemas.BLEStatus).to.be.an('object');
    expect(swaggerSpec.components.schemas.BLEStatus.properties.enabled).to.be.an('object');
    expect(swaggerSpec.components.schemas.BLEStatus.properties.connectedDevices).to.be.an('object');
    
    // Test HealthStatus schema
    expect(swaggerSpec.components.schemas.HealthStatus).to.be.an('object');
    expect(swaggerSpec.components.schemas.HealthStatus.properties.status).to.be.an('object');
    expect(swaggerSpec.components.schemas.HealthStatus.properties.ble).to.be.an('object');
    
    // Test Error schema
    expect(swaggerSpec.components.schemas.Error).to.be.an('object');
    expect(swaggerSpec.components.schemas.Error.properties.error).to.be.an('object');
    expect(swaggerSpec.components.schemas.Error.properties.timestamp).to.be.an('object');
    
    console.log('✅ Swagger schemas are properly configured');
    return true;
  } catch (error) {
    console.error('❌ Swagger schemas test failed:', error.message);
    return false;
  }
}

function testSwaggerDependencies() {
  console.log('📋 Testing Swagger Dependencies...');
  
  try {
    // Test that required packages are available
    const swaggerJsdoc = require('swagger-jsdoc');
    const swaggerUi = require('swagger-ui-express');
    
    expect(swaggerJsdoc).to.be.a('function');
    expect(swaggerUi).to.be.an('object');
    expect(swaggerUi.serve).to.be.an('array');
    expect(swaggerUi.setup).to.be.a('function');
    
    console.log('✅ Swagger dependencies are properly installed');
    return true;
  } catch (error) {
    console.error('❌ Swagger dependencies test failed:', error.message);
    return false;
  }
}

function testSwaggerGeneration() {
  console.log('📋 Testing Swagger Generation...');
  
  try {
    // Test that swagger-jsdoc can generate specs from JSDoc comments
    const options = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'Test API',
          version: '1.0.0',
        },
      },
      apis: ['./src/server.js'],
    };
    
    const specs = swaggerJsdoc(options);
    expect(specs).to.be.an('object');
    expect(specs.openapi).to.equal('3.0.0');
    
    console.log('✅ Swagger generation is working');
    return true;
  } catch (error) {
    console.error('❌ Swagger generation test failed:', error.message);
    return false;
  }
}

// Main test runner
async function runSwaggerTests() {
  console.log('🚀 Starting Swagger/OpenAPI Integration Tests\n');
  
  const tests = [
    { name: 'Swagger Configuration', fn: testSwaggerConfiguration },
    { name: 'Swagger Info', fn: testSwaggerInfo },
    { name: 'Swagger Servers', fn: testSwaggerServers },
    { name: 'Swagger Security Schemes', fn: testSwaggerSecuritySchemes },
    { name: 'Swagger Schemas', fn: testSwaggerSchemas },
    { name: 'Swagger Dependencies', fn: testSwaggerDependencies },
    { name: 'Swagger Generation', fn: testSwaggerGeneration }
  ];
  
  let passedTests = 0;
  let totalTests = tests.length;
  
  for (const test of tests) {
    console.log(`\n📋 Running ${test.name} Test...`);
    const result = test.fn();
    if (result) {
      passedTests++;
    }
  }
  
  console.log('\n📊 Swagger Test Results Summary:');
  console.log(`✅ Passed: ${passedTests}/${totalTests}`);
  console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 All Swagger tests passed! API documentation is properly configured.');
    console.log('\n📋 Swagger Features Available:');
    console.log('   • Interactive API documentation at /api-docs');
    console.log('   • OpenAPI 3.0 specification');
    console.log('   • JWT and API Key authentication');
    console.log('   • Comprehensive schema definitions');
    console.log('   • Request/response examples');
    console.log('   • Try-it-out functionality');
    
    process.exit(0);
  } else {
    console.log('\n⚠️  Some Swagger tests failed. Please check the configuration.');
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runSwaggerTests().catch(error => {
    console.error('💥 Swagger test runner failed:', error);
    process.exit(1);
  });
}

module.exports = {
  testSwaggerConfiguration,
  testSwaggerInfo,
  testSwaggerServers,
  testSwaggerSecuritySchemes,
  testSwaggerSchemas,
  testSwaggerDependencies,
  testSwaggerGeneration,
  runSwaggerTests
}; 