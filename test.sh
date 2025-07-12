 cd android && ./gradlew assembleDebug

 npm run test-apk-readiness
 
 node scripts/test-payment-refactor.js
 node scripts/test-qr-payment.js

 openssl rand -hex 32

wallet 
 npm install --save-dev dotenv-cli


Remove other sensitive files from tracking:

    git rm --cached airchainpay-relay/server.cert
   git rm --cached airchainpay-relay/.env.dev
   git rm --cached airchainpay-relay/.env.prod

Immediately remove the private key from git history:

      git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch airchainpay-contracts/.env' --prune-empty --tag-name-filter cat -- --all