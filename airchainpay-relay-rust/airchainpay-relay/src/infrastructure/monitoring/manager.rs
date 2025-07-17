use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::time::Duration;
use tokio::time::interval;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrometheusMetrics {
    pub transactions_received: u64,
    pub transactions_processed: u64,
    pub transactions_failed: u64,
    pub transactions_broadcasted: u64,
    pub rpc_errors: u64,
    pub gas_price_updates: u64,
    pub contract_events: u64,
    pub auth_failures: u64,
    pub rate_limit_hits: u64,
    pub blocked_devices: u64,
    pub uptime_seconds: f64,
    pub memory_usage_bytes: u64,
    pub cpu_usage_percent: f64,
    pub requests_total: u64,
    pub requests_successful: u64,
    pub requests_failed: u64,
    pub response_time_avg_ms: f64,
    pub active_connections: u64,
    pub database_operations: u64,
    pub database_errors: u64,
    pub compression_operations: u64,
    pub compression_ratio_avg: f64,
    pub security_events: u64,
    pub validation_failures: u64,
    pub cache_hits: u64,
    pub cache_misses: u64,
    pub network_errors: u64,
    pub blockchain_confirmations: u64,
    pub blockchain_timeouts: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetrics {
    pub memory_usage_bytes: u64,
    pub cpu_usage_percent: f64,
    pub disk_usage_percent: f64,
    pub network_bytes_in: u64,
    pub network_bytes_out: u64,
    pub open_file_descriptors: u64,
    pub thread_count: u64,
    pub heap_size_bytes: u64,
    pub heap_used_bytes: u64,
    pub gc_collections: u64,
    pub gc_time_ms: u64,
    pub uptime_seconds: f64,
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

#[derive(Debug)]
pub struct MonitoringManager {
    metrics: Arc<RwLock<PrometheusMetrics>>,
    system_metrics: Arc<RwLock<SystemMetrics>>,
    alerts: Arc<RwLock<Vec<Alert>>>,
    alert_rules: Arc<RwLock<Vec<AlertRule>>>,
    start_time: DateTime<Utc>,
    response_times: Arc<RwLock<Vec<f64>>>,
}

impl Default for MonitoringManager {
    fn default() -> Self {
        Self::new()
    }
}

impl MonitoringManager {
    pub fn new() -> Self {
        let manager = Self {
            metrics: Arc::new(RwLock::new(PrometheusMetrics::default())),
            system_metrics: Arc::new(RwLock::new(SystemMetrics::default())),
            alerts: Arc::new(RwLock::new(Vec::new())),
            alert_rules: Arc::new(RwLock::new(Self::default_alert_rules())),
            start_time: Utc::now(),
            response_times: Arc::new(RwLock::new(Vec::new())),
        };

        // Start system metrics collection
        let system_metrics = Arc::clone(&manager.system_metrics);
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(5));
            loop {
                interval.tick().await;
                Self::update_system_metrics_internal(&system_metrics).await;
            }
        });

        manager
    }

    async fn update_system_metrics_internal(system_metrics: &Arc<RwLock<SystemMetrics>>) {
        let mut metrics = system_metrics.write().await;
        
        // Update memory usage
        let mut memory_info = sysinfo::System::new_all();
        memory_info.refresh_all();
        metrics.memory_usage_bytes = memory_info.used_memory() * 1024; // Convert KB to bytes
        metrics.cpu_usage_percent = memory_info.global_cpu_usage() as f64;
        metrics.thread_count = memory_info.processes().len() as u64;

        // Update disk usage (simplified)
        metrics.disk_usage_percent = 0.0; // Would need more complex implementation

        // Update network stats (simplified)
        metrics.network_bytes_in = 0; // Would need network interface monitoring
        metrics.network_bytes_out = 0;

        // Update file descriptors (simplified)
        metrics.open_file_descriptors = 0; // Would need OS-specific implementation

        // Update heap stats (simplified for Rust)
        metrics.heap_size_bytes = 0;
        metrics.heap_used_bytes = 0;
        metrics.gc_collections = 0;
        metrics.gc_time_ms = 0;
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
                name: "high_memory_usage".to_string(),
                condition: "memory_usage_bytes > 1073741824".to_string(), // 1GB
                threshold: 1073741824.0,
                severity: AlertSeverity::Warning,
                enabled: true,
            },
            AlertRule {
                name: "high_response_time".to_string(),
                condition: "response_time_avg_ms > 5000".to_string(), // 5 seconds
                threshold: 5000.0,
                severity: AlertSeverity::Warning,
                enabled: true,
            },
            AlertRule {
                name: "high_rate_limit_hits".to_string(),
                condition: "rate_limit_hits > 1000".to_string(),
                threshold: 1000.0,
                severity: AlertSeverity::Warning,
                enabled: true,
            },
            AlertRule {
                name: "high_database_errors".to_string(),
                condition: "database_errors > 50".to_string(),
                threshold: 50.0,
                severity: AlertSeverity::Critical,
                enabled: true,
            },
        ]
    }



    pub async fn increment_metric(&self, metric_name: &str) {
        let mut metrics = self.metrics.write().await;
        
        match metric_name {
            "transactions_received" => metrics.transactions_received += 1,
            "transactions_processed" => metrics.transactions_processed += 1,
            "transactions_failed" => metrics.transactions_failed += 1,
            "transactions_broadcasted" => metrics.transactions_broadcasted += 1,
            "rpc_errors" => metrics.rpc_errors += 1,
            "gas_price_updates" => metrics.gas_price_updates += 1,
            "contract_events" => metrics.contract_events += 1,
            "auth_failures" => metrics.auth_failures += 1,
            "rate_limit_hits" => metrics.rate_limit_hits += 1,
            "blocked_devices" => metrics.blocked_devices += 1,
            "requests_total" => metrics.requests_total += 1,
            "requests_successful" => metrics.requests_successful += 1,
            "requests_failed" => metrics.requests_failed += 1,
            "active_connections" => metrics.active_connections += 1,
            "database_operations" => metrics.database_operations += 1,
            "database_errors" => metrics.database_errors += 1,
            "compression_operations" => metrics.compression_operations += 1,
            "security_events" => metrics.security_events += 1,
            "validation_failures" => metrics.validation_failures += 1,
            "cache_hits" => metrics.cache_hits += 1,
            "cache_misses" => metrics.cache_misses += 1,
            "network_errors" => metrics.network_errors += 1,
            "blockchain_confirmations" => metrics.blockchain_confirmations += 1,
            "blockchain_timeouts" => metrics.blockchain_timeouts += 1,
            _ => println!("Unknown metric: {metric_name}"),
        }
        
        // Update uptime
        metrics.uptime_seconds = (Utc::now() - self.start_time).num_seconds() as f64;
        
        // Check alert rules
        self.check_alert_rules().await;
    }

    pub async fn record_response_time(&self, response_time_ms: f64) {
        let mut response_times = self.response_times.write().await;
        response_times.push(response_time_ms);
        
        // Keep only last 1000 response times to prevent memory bloat
        if response_times.len() > 1000 {
            response_times.remove(0);
        }
        
        // Update average response time
        let mut metrics = self.metrics.write().await;
        metrics.response_time_avg_ms = response_times.iter().sum::<f64>() / response_times.len() as f64;
    }



    pub async fn get_system_metrics(&self) -> SystemMetrics {
        self.system_metrics.read().await.clone()
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
                "memory_usage_bytes > 1073741824" => metrics.memory_usage_bytes as f64 > rule.threshold,
                "response_time_avg_ms > 5000" => metrics.response_time_avg_ms > rule.threshold,
                "rate_limit_hits > 1000" => metrics.rate_limit_hits as f64 > rule.threshold,
                "database_errors > 50" => metrics.database_errors as f64 > rule.threshold,
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
        println!("Alert triggered: {} - {}", rule.name, alert.message);
        
        // Send notification (in production, this would send to Slack, email, etc.)
        self.send_notification(&alert).await;
    }

    async fn send_notification(&self, alert: &Alert) {
        // In production, this would send to various notification channels
        match alert.severity {
            AlertSeverity::Critical => {
                println!("CRITICAL ALERT: {} - {}", alert.name, alert.message);
            }
            AlertSeverity::Warning => {
                println!("WARNING: {} - {}", alert.name, alert.message);
            }
            AlertSeverity::Info => {
                println!("INFO: {} - {}", alert.name, alert.message);
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
            println!("Alert resolved: {alert_id}");
        }
        
        Ok(())
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
        health.insert("transactions".to_string(), serde_json::Value::Object(tx_metrics.into_iter().collect::<serde_json::Map<String, serde_json::Value>>()));
        
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
            rpc_errors: 0,
            gas_price_updates: 0,
            contract_events: 0,
            auth_failures: 0,
            rate_limit_hits: 0,
            blocked_devices: 0,
            uptime_seconds: 0.0,
            memory_usage_bytes: 0,
            cpu_usage_percent: 0.0,
            requests_total: 0,
            requests_successful: 0,
            requests_failed: 0,
            response_time_avg_ms: 0.0,
            active_connections: 0,
            database_operations: 0,
            database_errors: 0,
            compression_operations: 0,
            compression_ratio_avg: 0.0,
            security_events: 0,
            validation_failures: 0,
            cache_hits: 0,
            cache_misses: 0,
            network_errors: 0,
            blockchain_confirmations: 0,
            blockchain_timeouts: 0,
        }
    }
}

impl Default for SystemMetrics {
    fn default() -> Self {
        Self {
            memory_usage_bytes: 0,
            cpu_usage_percent: 0.0,
            disk_usage_percent: 0.0,
            network_bytes_in: 0,
            network_bytes_out: 0,
            open_file_descriptors: 0,
            thread_count: 0,
            heap_size_bytes: 0,
            heap_used_bytes: 0,
            gc_collections: 0,
            gc_time_ms: 0,
            uptime_seconds: 0.0,
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