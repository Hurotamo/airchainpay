# Slack Webhook Setup for AirChainPay Alerts

## Prerequisites
- Admin access to your Slack workspace
- Ability to create channels and apps

## Step 1: Create Slack Channels

Create these channels in your Slack workspace:
- `#airchainpay-alerts` - General alerts
- `#airchainpay-security` - Security alerts
- `#airchainpay-ops` - Operations alerts
- `#airchainpay-dev` - Development alerts

## Step 2: Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name: "AirChainPay Alerts"
4. Select your workspace

## Step 3: Configure Incoming Webhooks

1. In your app settings, go to "Features" → "Incoming Webhooks"
2. Toggle "Activate Incoming Webhooks" to ON
3. Click "Add New Webhook to Workspace"
4. Select channel: `#airchainpay-alerts`
5. Click "Allow"
6. **Copy the webhook URL** (starts with `https://hooks.slack.com/services/`)

## Step 4: Update Configuration

1. Copy `alerts/alertmanager.env.example` to `alerts/alertmanager.env`
2. Replace `YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN` with your actual webhook URL
3. Update other credentials (SMTP, PagerDuty, etc.)

## Step 5: Test the Setup

```bash
# Test your webhook
node scripts/test-slack-webhook.js "YOUR_WEBHOOK_URL"

# Example:
node scripts/test-slack-webhook.js "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"
```

## Step 6: Deploy Alertmanager

```bash
# Start monitoring with your new configuration
docker-compose -f docker-compose.monitoring.yml up -d
```

## Security Best Practices

1. **Never commit webhook URLs to version control**
2. Use environment variables for sensitive data
3. Rotate webhook URLs periodically
4. Monitor webhook usage for unusual activity

## Troubleshooting

### Common Issues:

1. **"Invalid webhook URL"**
   - Verify the webhook URL is correct
   - Check that the app is installed to your workspace

2. **"Channel not found"**
   - Ensure the channel exists
   - Check that the app has permission to post to the channel

3. **"Rate limited"**
   - Slack has rate limits (1 message per second per webhook)
   - Consider using multiple webhooks for different alert types

### Test Commands:

```bash
# Check if alertmanager is running
docker ps | grep alertmanager

# View alertmanager logs
docker logs airchainpay-alertmanager

# Test webhook manually
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"Test alert from AirChainPay"}' \
  YOUR_WEBHOOK_URL
```

## Next Steps

1. Set up SMTP for email alerts
2. Configure PagerDuty for critical alerts
3. Set up Grafana dashboards
4. Create alert rules in Prometheus

## Support

If you need help:
1. Check the logs: `docker logs airchainpay-alertmanager`
2. Test webhook manually
3. Verify Slack app permissions
4. Check network connectivity 