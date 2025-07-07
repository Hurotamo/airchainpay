# AirChainPay Relay - Production Secrets Setup

This guide explains how to securely configure and manage production secrets for the AirChainPay relay server.

---

## 1. Identify Required Secrets

Check `.env.example` or `env.prod` for all required secret values, such as:
- `JWT_SECRET` (for authentication)
- `DB_URI` (database connection string)
- `BLOCKCHAIN_RPC_URL` (mainnet RPC endpoint)
- `BLOCKCHAIN_PRIVATE_KEY` (relay wallet private key)
- `SLACK_WEBHOOK_URL` (for alerting)
- `EMAIL_SMTP_PASSWORD` (for notifications)
- Any other sensitive values

---

## 2. Create/Edit the Production Secrets File

Edit or create `env.prod` in the project root:

```env
NODE_ENV=production
PORT=4000
JWT_SECRET=your-very-strong-secret
DB_URI=your-production-db-uri
BLOCKCHAIN_RPC_URL=your-mainnet-rpc-url
BLOCKCHAIN_PRIVATE_KEY=your-relay-wallet-private-key
SLACK_WEBHOOK_URL=your-slack-webhook
EMAIL_SMTP_PASSWORD=your-smtp-password
# ...add any other required secrets
```

**Never commit this file to version control!**

---

## 3. Generate Strong Secrets

If available, use the provided script to generate strong secrets:

```bash
node scripts/generate-secrets.js prod
```

Or use a password manager to generate random, high-entropy values.

---

## 4. Use Secrets in Production

- In `docker-compose.prod.yml`, ensure:
  ```yaml
  env_file:
    - .env.prod
    - .env
  ```
- For cloud deployments, use your provider's secret manager and inject secrets as environment variables.

---

## 5. Verify Secrets Are Loaded

- Check application logs for missing secret warnings.
- Use `/health` endpoint to verify the relay is running with production config.

---

## 6. Rotate and Protect Secrets

- Rotate secrets regularly (especially after personnel changes).
- Restrict access to `env.prod` to only trusted admins.
- Use strong, unique values for each secret.
- Never share secrets in chat, email, or version control.

---

## 7. Checklist

- [ ] All required secrets are present in `env.prod`
- [ ] Secrets are strong and unique
- [ ] `env.prod` is not committed to git
- [ ] Docker/production environment loads secrets from `env.prod` or secret manager
- [ ] Secrets are rotated regularly
- [ ] Access to secrets is restricted

---

## 8. References
- [12 Factor App: Store config in the environment](https://12factor.net/config)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

---

**Your production secrets are now secure and ready for deployment!** 