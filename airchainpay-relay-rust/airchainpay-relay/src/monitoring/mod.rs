use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use crate::logger::Logger;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrometheusMetrics {
    pub transactions_received: u64,
    pub transactions_processed: u64,
    pub transactions_failed: u64,
    pub transactions_broadcasted: u64,
    pub ble_connections: u64,
    pub ble_disconnections: u64,
    pub ble_authentications: u64,
    pub ble_key_exchanges: u64,
    pub rpc_errors: u64,
    pub gas_price_updates: u64,
    pub contract_events: u64,
    pub auth_failures: u64,
    pub rate_limit_hits: u64,
    pub blocked_devices: u64,
    pub uptime_seconds: f64,
    pub memory_usage_bytes: u64,
    pub cpu_usage_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alert {
    pub id: String,
    pub name: String,
    pub severity: AlertSeverity,
    pub message: String,
    pub timestamp: DateTime<Utc>,
    pub resolved: bool,
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AlertSeverity {
    Info,
    Warning,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertRule {
    pub name: String,
    pub condition: String,
    pub threshold: f64,
    pub severity: AlertSeverity,
    pub enabled: bool,
}

pub struct MonitoringManager {
    metrics: Arc<RwLock<PrometheusMetrics>>,
    alerts: Arc<RwLock<Vec<Alert>>>,
    alert_rules: Arc<RwLock<Vec<AlertRule>>>,
    start_time: DateTime<Utc>,
}

impl MonitoringManager {
    pub fn new() -> Self {
        Self {
            metrics: Arc::new(RwLock::new(PrometheusMetrics::default())),
            alerts: Arc::new(RwLock::new(Vec::new())),
            alert_rules: Arc::new(RwLock::new(Self::default_alert_rules())),
            start_time: Utc::now(),
        }
    }

    fn default_alert_rules() -> Vec<AlertRule> {
        vec![
            AlertRule {
                name: "high_transaction_failure_rate".to_string(),
                condition: "transactions_failed / transactions_received > 0.1".to_string(),
                threshold: 0.1,
                severity: AlertSeverity::Warning,
                enabled: true,
            },
            AlertRule {
                name: "high_rpc_error_rate".to_string(),
                condition: "rpc_errors > 100".to_string(),
                threshold: 100.0,
                severity: AlertSeverity::Critical,
                enabled: true,
            },
            AlertRule {
                name: "high_auth_failure_rate".to_string(),
                condition: "auth_failures > 50".to_string(),
                threshold: 50.0,
                severity: AlertSeverity::Warning,
                enabled: true,
            },
            AlertRule {
                name: "low_ble_connections".to_string(),
                condition: "ble_connections < 1".to_string(),
                threshold: 1.0,
                severity: AlertSeverity::Info,
                enabled: true,
            },
            AlertRule {
                name: "high_memory_usage".to_string(),
                condition: "memory_usage_bytes > 1073741824".to_string(), // 1GB
                threshold: 1073741824.0,
                severity: AlertSeverity::Warning,
                enabled: true,
            },
        ]
    }

    pub async fn update_metric(&self, metric_name: &str, value: u64) {
        let mut metrics = self.metrics.write().await;
        
        match metric_name {
            "transactions_received" => metrics.transactions_received = value,
            "transactions_processed" => metrics.transactions_processed = value,
            "transactions_failed" => metrics.transactions_failed = value,
            "transactions_broadcasted" => metrics.transactions_broadcasted = value,
            "ble_connections" => metrics.ble_connections = value,
            "ble_disconnections" => metrics.ble_disconnections = value,
            "ble_authentications" => metrics.ble_authentications = value,
            "ble_key_exchanges" => metrics.ble_key_exchanges = value,
            "rpc_errors" => metrics.rpc_errors = value,
            "gas_price_updates" => metrics.gas_price_updates = value,
            "contract_events" => metrics.contract_events = value,
            "auth_failures" => metrics.auth_failures = value,
            "rate_limit_hits" => metrics.rate_limit_hits = value,
            "blocked_devices" => metrics.blocked_devices = value,
            _ => Logger::warn(&format!("Unknown metric: {}", metric_name)),
        }
        
        // Update uptime
        metrics.uptime_seconds = (Utc::now() - self.start_time).num_seconds() as f64;
        
        // Check alert rules
        self.check_alert_rules().await;
    }

    pub async fn increment_metric(&self, metric_name: &str) {
        let mut metrics = self.metrics.write().await;
        
        match metric_name {
            "transactions_received" => metrics.transactions_received += 1,
            "transactions_processed" => metrics.transactions_processed += 1,
            "transactions_failed" => metrics.transactions_failed += 1,
            "transactions_broadcasted" => metrics.transactions_broadcasted += 1,
            "ble_connections" => metrics.ble_connections += 1,
            "ble_disconnections" => metrics.ble_disconnections += 1,
            "ble_authentications" => metrics.ble_authentications += 1,
            "ble_key_exchanges" => metrics.ble_key_exchanges += 1,
            "rpc_errors" => metrics.rpc_errors += 1,
            "gas_price_updates" => metrics.gas_price_updates += 1,
            "contract_events" => metrics.contract_events += 1,
            "auth_failures" => metrics.auth_failures += 1,
            "rate_limit_hits" => metrics.rate_limit_hits += 1,
            "blocked_devices" => metrics.blocked_devices += 1,
            _ => Logger::warn(&format!("Unknown metric: {}", metric_name)),
        }
        
        // Update uptime
        metrics.uptime_seconds = (Utc::now() - self.start_time).num_seconds() as f64;
        
        // Check alert rules
        self.check_alert_rules().await;
    }

    pub async fn update_system_metrics(&self, memory_usage: u64, cpu_usage: f64) {
        let mut metrics = self.metrics.write().await;
        metrics.memory_usage_bytes = memory_usage;
        metrics.cpu_usage_percent = cpu_usage;
        metrics.uptime_seconds = (Utc::now() - self.start_time).num_seconds() as f64;
    }

    async fn check_alert_rules(&self) {
        let metrics = self.metrics.read().await;
        let alert_rules = self.alert_rules.read().await;
        
        for rule in alert_rules.iter() {
            if !rule.enabled {
                continue;
            }
            
            let triggered = match rule.condition.as_str() {
                "transactions_failed / transactions_received > 0.1" => {
                    if metrics.transactions_received > 0 {
                        (metrics.transactions_failed as f64 / metrics.transactions_received as f64) > rule.threshold
                    } else {
                        false
                    }
                }
                "rpc_errors > 100" => metrics.rpc_errors as f64 > rule.threshold,
                "auth_failures > 50" => metrics.auth_failures as f64 > rule.threshold,
                "ble_connections < 1" => metrics.ble_connections as f64 < rule.threshold,
                "memory_usage_bytes > 1073741824" => metrics.memory_usage_bytes as f64 > rule.threshold,
                _ => false,
            };
            
            if triggered {
                self.create_alert(rule, &metrics).await;
            }
        }
    }

    async fn create_alert(&self, rule: &AlertRule, metrics: &PrometheusMetrics) {
        let alert = Alert {
            id: uuid::Uuid::new_v4().to_string(),
            name: rule.name.clone(),
            severity: rule.severity.clone(),
            message: format!("Alert triggered: {}", rule.name),
            timestamp: Utc::now(),
            resolved: false,
            metadata: serde_json::to_value(metrics)
                .map(|v| serde_json::from_value(v).unwrap_or_default())
                .unwrap_or_default(),
        };
        
        let mut alerts = self.alerts.write().await;
        alerts.push(alert.clone());
        
        // Log the alert
        Logger::warn(&format!("Alert triggered: {} - {}", rule.name, alert.message));
        
        // Send notification (in production, this would send to Slack, email, etc.)
        self.send_notification(&alert).await;
    }

    async fn send_notification(&self, alert: &Alert) {
        // In production, this would send to various notification channels
        match alert.severity {
            AlertSeverity::Critical => {
                Logger::error(&format!("CRITICAL ALERT: {} - {}", alert.name, alert.message));
            }
            AlertSeverity::Warning => {
                Logger::warn(&format!("WARNING: {} - {}", alert.name, alert.message));
            }
            AlertSeverity::Info => {
                Logger::info(&format!("INFO: {} - {}", alert.name, alert.message));
            }
        }
    }

    pub async fn get_metrics(&self) -> PrometheusMetrics {
        self.metrics.read().await.clone()
    }

    pub async fn get_alerts(&self, limit: usize) -> Vec<Alert> {
        let alerts = self.alerts.read().await;
        alerts.iter()
            .rev()
            .take(limit)
            .cloned()
            .collect()
    }

    pub async fn resolve_alert(&self, alert_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut alerts = self.alerts.write().await;
        
        if let Some(alert) = alerts.iter_mut().find(|a| a.id == alert_id) {
            alert.resolved = true;
            Logger::info(&format!("Alert resolved: {}", alert_id));
        }
        
        Ok(())
    }

    pub async fn add_alert_rule(&self, rule: AlertRule) {
        let mut rules = self.alert_rules.write().await;
        rules.push(rule);
    }

    pub async fn remove_alert_rule(&self, rule_name: &str) {
        let mut rules = self.alert_rules.write().await;
        rules.retain(|r| r.name != rule_name);
    }

    pub async fn enable_alert_rule(&self, rule_name: &str) {
        let mut rules = self.alert_rules.write().await;
        if let Some(rule) = rules.iter_mut().find(|r| r.name == rule_name) {
            rule.enabled = true;
        }
    }

    pub async fn disable_alert_rule(&self, rule_name: &str) {
        let mut rules = self.alert_rules.write().await;
        if let Some(rule) = rules.iter_mut().find(|r| r.name == rule_name) {
            rule.enabled = false;
        }
    }

    pub async fn get_health_status(&self) -> HashMap<String, serde_json::Value> {
        let metrics = self.metrics.read().await;
        let alerts = self.alerts.read().await;
        
        let mut health = HashMap::new();
        
        // Overall status
        let critical_alerts = alerts.iter()
            .filter(|a| !a.resolved && matches!(a.severity, AlertSeverity::Critical))
            .count();
        
        let status = if critical_alerts > 0 {
            "unhealthy"
        } else {
            "healthy"
        };
        
        health.insert("status".to_string(), serde_json::Value::String(status.to_string()));
        health.insert("uptime_seconds".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(metrics.uptime_seconds).unwrap()));
        health.insert("memory_usage_bytes".to_string(), serde_json::Value::Number(serde_json::Number::from(metrics.memory_usage_bytes)));
        health.insert("cpu_usage_percent".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(metrics.cpu_usage_percent).unwrap()));
        health.insert("active_alerts".to_string(), serde_json::Value::Number(serde_json::Number::from(alerts.iter().filter(|a| !a.resolved).count() as u64)));
        
        // Transaction metrics
        let mut tx_metrics = HashMap::new();
        tx_metrics.insert("received".to_string(), serde_json::Value::Number(serde_json::Number::from(metrics.transactions_received)));
        tx_metrics.insert("processed".to_string(), serde_json::Value::Number(serde_json::Number::from(metrics.transactions_processed)));
        tx_metrics.insert("failed".to_string(), serde_json::Value::Number(serde_json::Number::from(metrics.transactions_failed)));
        tx_metrics.insert("broadcasted".to_string(), serde_json::Value::Number(serde_json::Number::from(metrics.transactions_broadcasted)));
        health.insert("transactions".to_string(), serde_json::Value::Object(tx_metrics));
        
        // BLE metrics
        let mut ble_metrics = HashMap::new();
        ble_metrics.insert("connections".to_string(), serde_json::Value::Number(serde_json::Number::from(metrics.ble_connections)));
        ble_metrics.insert("disconnections".to_string(), serde_json::Value::Number(serde_json::Number::from(metrics.ble_disconnections)));
        ble_metrics.insert("authentications".to_string(), serde_json::Value::Number(serde_json::Number::from(metrics.ble_authentications)));
        ble_metrics.insert("key_exchanges".to_string(), serde_json::Value::Number(serde_json::Number::from(metrics.ble_key_exchanges)));
        health.insert("ble".to_string(), serde_json::Value::Object(ble_metrics));
        
        health
    }
}

impl Default for PrometheusMetrics {
    fn default() -> Self {
        Self {
            transactions_received: 0,
            transactions_processed: 0,
            transactions_failed: 0,
            transactions_broadcasted: 0,
            ble_connections: 0,
            ble_disconnections: 0,
            ble_authentications: 0,
            ble_key_exchanges: 0,
            rpc_errors: 0,
            gas_price_updates: 0,
            contract_events: 0,
            auth_failures: 0,
            rate_limit_hits: 0,
            blocked_devices: 0,
            uptime_seconds: 0.0,
            memory_usage_bytes: 0,
            cpu_usage_percent: 0.0,
        }
    }
}

impl std::fmt::Display for AlertSeverity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AlertSeverity::Info => write!(f, "INFO"),
            AlertSeverity::Warning => write!(f, "WARNING"),
            AlertSeverity::Critical => write!(f, "CRITICAL"),
        }
    }
} 