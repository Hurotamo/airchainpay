# AirChainPay Relay Monitoring Setup

This guide explains how to set up and use the monitoring infrastructure for the AirChainPay relay server using Prometheus, Grafana, and Alertmanager.

---

## 1. Prerequisites

### Install Docker Desktop
1. Download Docker Desktop from [https://www.docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
2. Install and start Docker Desktop
3. Wait for Docker to be running (you'll see the Docker icon in your menu bar)

### Alternative: Install via Homebrew
```bash
brew install docker docker-compose
brew install --cask docker
```

### Verify Installation
```bash
docker --version
docker-compose --version
```

### Other Requirements
- Ports 9090 (Prometheus), 3000 (Grafana), and 9093 (Alertmanager) open
- The relay server running and exposing `/metrics` on port 4000

---

## 2. Start the Monitoring Stack

### Option 1: Using the provided script (Recommended)
From the `airchainpay-relay` directory, run:

```bash
./start-monitoring.sh
```

This script will:
- Check if Docker is running
- Verify Docker Compose is available
- Start the monitoring stack
- Provide access URLs

### Option 2: Manual start
From the `airchainpay-relay` directory, run:

```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

This will start:
- **Prometheus** (http://localhost:9090)
- **Grafana** (http://localhost:3000, default password: `admin`)
- **Alertmanager** (http://localhost:9093)

---

## 3. Prometheus Configuration
- Config file: `monitoring/prometheus.yml`
- Scrapes relay server at `/metrics` and `/health`
- Loads alert rules from `monitoring/alerts.yml`
- Sends alerts to Alertmanager

---

## 4. Grafana Dashboards
- Dashboard JSON: `monitoring/grafana/dashboards/relay-dashboard.json`
- Import this dashboard in Grafana for real-time metrics
- Default login: `admin` / `admin`

---

## 5. Alertmanager
- Config file: `alerts/alertmanager.yml`
- Notification templates: `alerts/notification-templates.yml`
- Receives alerts from Prometheus and routes to Slack, email, etc.

---

## 6. Stopping the Monitoring Stack

```bash
docker-compose -f docker-compose.monitoring.yml down
```

---

## 7. Customization
- Edit `monitoring/prometheus.yml` to add/remove scrape targets
- Edit `monitoring/alerts.yml` to change alert rules
- Edit `alerts/alertmanager.yml` to change notification channels
- Add more dashboards to `monitoring/grafana/dashboards/`

---

## 8. Troubleshooting
- Check container logs: `docker logs prometheus`, `docker logs grafana`, `docker logs alertmanager`
- Verify relay server `/metrics` endpoint is accessible
- Check Prometheus targets page for scrape status

---

## 9. References
- [Prometheus Docs](https://prometheus.io/docs/)
- [Grafana Docs](https://grafana.com/docs/)
- [Alertmanager Docs](https://prometheus.io/docs/alerting/latest/alertmanager/)

---

**Your monitoring stack is now ready to provide real-time observability, alerting, and dashboards for AirChainPay Relay!** 