# Setup development environment
node scripts/deploy.js dev setup
node scripts/deploy.js dev secrets
node scripts/deploy.js dev validate

# Setup staging environment  
node scripts/deploy.js staging setup
node scripts/deploy.js staging secrets
node scripts/deploy.js staging validate

#
node scripts/generate-secrets.js prod