#!/usr/bin/env node

const https = require('https');

// Test Slack webhook
function testSlackWebhook(webhookUrl) {
  const data = JSON.stringify({
    text: '🚨 **AirChainPay Alert Test**\nThis is a test message from your monitoring system.',
    channel: '#airchainpay-alerts',
    username: 'AirChainPay Monitor',
    icon_emoji: ':warning:',
  });

  const options = {
    hostname: 'hooks.slack.com',
    port: 443,
    path: webhookUrl.replace('https://hooks.slack.com', ''),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
    },
  };

  const req = https.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers)}`);
    
    res.on('data', (chunk) => {
      console.log(`Response: ${chunk}`);
    });
  });

  req.on('error', (error) => {
    console.error('Error:', error);
  });

  req.write(data);
  req.end();
}

// Usage
if (require.main === module) {
  const webhookUrl = process.argv[2];
  
  if (!webhookUrl) {
    console.log('Usage: node test-slack-webhook.js <webhook-url>');
    console.log('Example: node test-slack-webhook.js https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX');
    process.exit(1);
  }

  console.log('Testing Slack webhook...');
  testSlackWebhook(webhookUrl);
}

module.exports = { testSlackWebhook }; 