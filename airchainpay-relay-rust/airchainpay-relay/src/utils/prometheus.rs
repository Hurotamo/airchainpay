use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
// Remove logger import and replace with simple logging
// use crate::logger::Logger;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrometheusMetric {
    pub name: String,
    pub value: f64,
    pub labels: HashMap<String, String>,
    pub timestamp: Option<DateTime<Utc>>,
    pub help: Option<String>,
    pub metric_type: MetricType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MetricType {
    Counter,
    Gauge,
    Histogram,
    Summary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrometheusMetrics {
    pub transactions_received_total: u64,
    pub transactions_processed_total: u64,
    pub transactions_failed_total: u64,
    pub transactions_broadcasted_total: u64,
    pub ble_connections_total: u64,
    pub ble_disconnections_total: u64,
    pub ble_authentications_total: u64,
    pub ble_key_exchanges_total: u64,
    pub rpc_errors_total: u64,
    pub gas_price_updates_total: u64,
    pub contract_events_total: u64,
    pub auth_failures_total: u64,
    pub rate_limit_hits_total: u64,
    pub blocked_devices_total: u64,
    pub uptime_seconds: f64,
    pub memory_usage_bytes: u64,
    pub cpu_usage_percent: f64,
    pub request_duration_seconds: Vec<f64>,
    pub active_connections: u64,
    pub cache_hit_ratio: f64,
    pub cache_miss_ratio: f64,
    pub disk_usage_bytes: u64,
    pub network_bytes_received: u64,
    pub network_bytes_sent: u64,
}

pub struct PrometheusExporter {
    metrics: Arc<RwLock<PrometheusMetrics>>,
    custom_metrics: Arc<RwLock<HashMap<String, PrometheusMetric>>>,
    start_time: DateTime<Utc>,
}

impl PrometheusExporter {
    pub fn new() -> Self {
        Self {
            metrics: Arc::new(RwLock::new(PrometheusMetrics::default())),
            custom_metrics: Arc::new(RwLock::new(HashMap::new())),
            start_time: Utc::now(),
        }
    }

    pub async fn increment_counter(&self, metric_name: &str, value: u64) {
        let mut metrics = self.metrics.write().await;
        
        match metric_name {
            "transactions_received_total" => metrics.transactions_received_total += value,
            "transactions_processed_total" => metrics.transactions_processed_total += value,
            "transactions_failed_total" => metrics.transactions_failed_total += value,
            "transactions_broadcasted_total" => metrics.transactions_broadcasted_total += value,
            "ble_connections_total" => metrics.ble_connections_total += value,
            "ble_disconnections_total" => metrics.ble_disconnections_total += value,
            "ble_authentications_total" => metrics.ble_authentications_total += value,
            "ble_key_exchanges_total" => metrics.ble_key_exchanges_total += value,
            "rpc_errors_total" => metrics.rpc_errors_total += value,
            "gas_price_updates_total" => metrics.gas_price_updates_total += value,
            "contract_events_total" => metrics.contract_events_total += value,
            "auth_failures_total" => metrics.auth_failures_total += value,
            "rate_limit_hits_total" => metrics.rate_limit_hits_total += value,
            "blocked_devices_total" => metrics.blocked_devices_total += value,
            _ => println!("Unknown metric: {}", metric_name),
        }
    }

    pub async fn set_gauge(&self, metric_name: &str, value: f64) {
        let mut metrics = self.metrics.write().await;
        
        match metric_name {
            "uptime_seconds" => metrics.uptime_seconds = value,
            "memory_usage_bytes" => metrics.memory_usage_bytes = value as u64,
            "cpu_usage_percent" => metrics.cpu_usage_percent = value,
            "active_connections" => metrics.active_connections = value as u64,
            "cache_hit_ratio" => metrics.cache_hit_ratio = value,
            "cache_miss_ratio" => metrics.cache_miss_ratio = value,
            "disk_usage_bytes" => metrics.disk_usage_bytes = value as u64,
            "network_bytes_received" => metrics.network_bytes_received = value as u64,
            "network_bytes_sent" => metrics.network_bytes_sent = value as u64,
            _ => println!("Unknown gauge metric: {}", metric_name),
        }
    }

    pub async fn record_histogram(&self, metric_name: &str, value: f64) {
        let mut metrics = self.metrics.write().await;
        
        match metric_name {
            "request_duration_seconds" => {
                metrics.request_duration_seconds.push(value);
                // Keep only last 1000 values
                if metrics.request_duration_seconds.len() > 1000 {
                    metrics.request_duration_seconds.remove(0);
                }
            }
            _ => println!("Unknown histogram metric: {}", metric_name),
        }
    }

    pub async fn add_custom_metric(&self, metric: PrometheusMetric) {
        let mut custom_metrics = self.custom_metrics.write().await;
        custom_metrics.insert(metric.name.clone(), metric);
    }

    pub async fn export_metrics(&self) -> String {
        let metrics = self.metrics.read().await;
        let custom_metrics = self.custom_metrics.read().await;
        
        let mut output = String::new();
        
        // Add timestamp
        output.push_str(&format!("# HELP airchainpay_build_info Build information\n"));
        output.push_str(&format!("# TYPE airchainpay_build_info gauge\n"));
        output.push_str(&format!("airchainpay_build_info{{version=\"{}\",rust_version=\"{}\"}} 1\n\n", 
            env!("CARGO_PKG_VERSION"), "1.70.0"));

        // Transaction metrics
        output.push_str("# HELP airchainpay_transactions_received_total Total number of transactions received\n");
        output.push_str("# TYPE airchainpay_transactions_received_total counter\n");
        output.push_str(&format!("airchainpay_transactions_received_total {}\n\n", metrics.transactions_received_total));

        output.push_str("# HELP airchainpay_transactions_processed_total Total number of transactions processed\n");
        output.push_str("# TYPE airchainpay_transactions_processed_total counter\n");
        output.push_str(&format!("airchainpay_transactions_processed_total {}\n\n", metrics.transactions_processed_total));

        output.push_str("# HELP airchainpay_transactions_failed_total Total number of transactions failed\n");
        output.push_str("# TYPE airchainpay_transactions_failed_total counter\n");
        output.push_str(&format!("airchainpay_transactions_failed_total {}\n\n", metrics.transactions_failed_total));

        output.push_str("# HELP airchainpay_transactions_broadcasted_total Total number of transactions broadcasted\n");
        output.push_str("# TYPE airchainpay_transactions_broadcasted_total counter\n");
        output.push_str(&format!("airchainpay_transactions_broadcasted_total {}\n\n", metrics.transactions_broadcasted_total));

        // BLE metrics
        output.push_str("# HELP airchainpay_ble_connections_total Total number of BLE connections\n");
        output.push_str("# TYPE airchainpay_ble_connections_total counter\n");
        output.push_str(&format!("airchainpay_ble_connections_total {}\n\n", metrics.ble_connections_total));

        output.push_str("# HELP airchainpay_ble_disconnections_total Total number of BLE disconnections\n");
        output.push_str("# TYPE airchainpay_ble_disconnections_total counter\n");
        output.push_str(&format!("airchainpay_ble_disconnections_total {}\n\n", metrics.ble_disconnections_total));

        output.push_str("# HELP airchainpay_ble_authentications_total Total number of BLE authentications\n");
        output.push_str("# TYPE airchainpay_ble_authentications_total counter\n");
        output.push_str(&format!("airchainpay_ble_authentications_total {}\n\n", metrics.ble_authentications_total));

        output.push_str("# HELP airchainpay_ble_key_exchanges_total Total number of BLE key exchanges\n");
        output.push_str("# TYPE airchainpay_ble_key_exchanges_total counter\n");
        output.push_str(&format!("airchainpay_ble_key_exchanges_total {}\n\n", metrics.ble_key_exchanges_total));

        // Error metrics
        output.push_str("# HELP airchainpay_rpc_errors_total Total number of RPC errors\n");
        output.push_str("# TYPE airchainpay_rpc_errors_total counter\n");
        output.push_str(&format!("airchainpay_rpc_errors_total {}\n\n", metrics.rpc_errors_total));

        output.push_str("# HELP airchainpay_auth_failures_total Total number of authentication failures\n");
        output.push_str("# TYPE airchainpay_auth_failures_total counter\n");
        output.push_str(&format!("airchainpay_auth_failures_total {}\n\n", metrics.auth_failures_total));

        output.push_str("# HELP airchainpay_rate_limit_hits_total Total number of rate limit hits\n");
        output.push_str("# TYPE airchainpay_rate_limit_hits_total counter\n");
        output.push_str(&format!("airchainpay_rate_limit_hits_total {}\n\n", metrics.rate_limit_hits_total));

        output.push_str("# HELP airchainpay_blocked_devices_total Total number of blocked devices\n");
        output.push_str("# TYPE airchainpay_blocked_devices_total counter\n");
        output.push_str(&format!("airchainpay_blocked_devices_total {}\n\n", metrics.blocked_devices_total));

        // System metrics
        output.push_str("# HELP airchainpay_uptime_seconds Server uptime in seconds\n");
        output.push_str("# TYPE airchainpay_uptime_seconds gauge\n");
        output.push_str(&format!("airchainpay_uptime_seconds {}\n\n", metrics.uptime_seconds));

        output.push_str("# HELP airchainpay_memory_usage_bytes Memory usage in bytes\n");
        output.push_str("# TYPE airchainpay_memory_usage_bytes gauge\n");
        output.push_str(&format!("airchainpay_memory_usage_bytes {}\n\n", metrics.memory_usage_bytes));

        output.push_str("# HELP airchainpay_cpu_usage_percent CPU usage percentage\n");
        output.push_str("# TYPE airchainpay_cpu_usage_percent gauge\n");
        output.push_str(&format!("airchainpay_cpu_usage_percent {}\n\n", metrics.cpu_usage_percent));

        output.push_str("# HELP airchainpay_active_connections Number of active connections\n");
        output.push_str("# TYPE airchainpay_active_connections gauge\n");
        output.push_str(&format!("airchainpay_active_connections {}\n\n", metrics.active_connections));

        output.push_str("# HELP airchainpay_cache_hit_ratio Cache hit ratio\n");
        output.push_str("# TYPE airchainpay_cache_hit_ratio gauge\n");
        output.push_str(&format!("airchainpay_cache_hit_ratio {}\n\n", metrics.cache_hit_ratio));

        output.push_str("# HELP airchainpay_cache_miss_ratio Cache miss ratio\n");
        output.push_str("# TYPE airchainpay_cache_miss_ratio gauge\n");
        output.push_str(&format!("airchainpay_cache_miss_ratio {}\n\n", metrics.cache_miss_ratio));

        output.push_str("# HELP airchainpay_disk_usage_bytes Disk usage in bytes\n");
        output.push_str("# TYPE airchainpay_disk_usage_bytes gauge\n");
        output.push_str(&format!("airchainpay_disk_usage_bytes {}\n\n", metrics.disk_usage_bytes));

        output.push_str("# HELP airchainpay_network_bytes_received Network bytes received\n");
        output.push_str("# TYPE airchainpay_network_bytes_received counter\n");
        output.push_str(&format!("airchainpay_network_bytes_received {}\n\n", metrics.network_bytes_received));

        output.push_str("# HELP airchainpay_network_bytes_sent Network bytes sent\n");
        output.push_str("# TYPE airchainpay_network_bytes_sent counter\n");
        output.push_str(&format!("airchainpay_network_bytes_sent {}\n\n", metrics.network_bytes_sent));

        // Request duration histogram
        if !metrics.request_duration_seconds.is_empty() {
            output.push_str("# HELP airchainpay_request_duration_seconds Request duration in seconds\n");
            output.push_str("# TYPE airchainpay_request_duration_seconds histogram\n");
            
            let buckets = vec![0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0];
            let mut bucket_counts = vec![0; buckets.len()];
            let mut sum = 0.0;
            
            for duration in &metrics.request_duration_seconds {
                sum += duration;
                for (i, bucket) in buckets.iter().enumerate() {
                    if duration <= bucket {
                        bucket_counts[i] += 1;
                    }
                }
            }
            
            for (i, bucket) in buckets.iter().enumerate() {
                output.push_str(&format!("airchainpay_request_duration_seconds_bucket{{le=\"{}\"}} {}\n", bucket, bucket_counts[i]));
            }
            output.push_str(&format!("airchainpay_request_duration_seconds_bucket{{le=\"+Inf\"}} {}\n", metrics.request_duration_seconds.len()));
            output.push_str(&format!("airchainpay_request_duration_seconds_sum {}\n", sum));
            output.push_str(&format!("airchainpay_request_duration_seconds_count {}\n\n", metrics.request_duration_seconds.len()));
        }

        // Custom metrics
        for metric in custom_metrics.values() {
            if let Some(help) = &metric.help {
                output.push_str(&format!("# HELP {} {}\n", metric.name, help));
            }
            
            match metric.metric_type {
                MetricType::Counter => {
                    output.push_str(&format!("# TYPE {} counter\n", metric.name));
                }
                MetricType::Gauge => {
                    output.push_str(&format!("# TYPE {} gauge\n", metric.name));
                }
                MetricType::Histogram => {
                    output.push_str(&format!("# TYPE {} histogram\n", metric.name));
                }
                MetricType::Summary => {
                    output.push_str(&format!("# TYPE {} summary\n", metric.name));
                }
            }
            
            let mut label_str = String::new();
            if !metric.labels.is_empty() {
                label_str.push('{');
                let label_pairs: Vec<String> = metric.labels.iter()
                    .map(|(k, v)| format!("{}=\"{}\"", k, v))
                    .collect();
                label_str.push_str(&label_pairs.join(","));
                label_str.push('}');
            }
            
            output.push_str(&format!("{}{} {}\n", metric.name, label_str, metric.value));
        }

        output
    }

    pub async fn update_system_metrics(&self) {
        let mut metrics = self.metrics.write().await;
        
        // Update uptime
        metrics.uptime_seconds = (Utc::now() - self.start_time).num_seconds() as f64;
        
        // Update memory usage (simplified)
        let mut sys = sysinfo::System::new_all();
        sys.refresh_memory();
        metrics.memory_usage_bytes = sys.used_memory() * 1024; // Convert KB to bytes
        
        // Update CPU usage (simplified)
        let mut sys = sysinfo::System::new_all();
        sys.refresh_cpu_all();
        metrics.cpu_usage_percent = sys.global_cpu_usage() as f64;
    }

    pub async fn get_metrics_summary(&self) -> HashMap<String, serde_json::Value> {
        let metrics = self.metrics.read().await;
        
        let mut summary = HashMap::new();
        
        summary.insert("transactions".to_string(), serde_json::json!({
            "received": metrics.transactions_received_total,
            "processed": metrics.transactions_processed_total,
            "failed": metrics.transactions_failed_total,
            "broadcasted": metrics.transactions_broadcasted_total,
        }));
        
        summary.insert("ble".to_string(), serde_json::json!({
            "connections": metrics.ble_connections_total,
            "disconnections": metrics.ble_disconnections_total,
            "authentications": metrics.ble_authentications_total,
            "key_exchanges": metrics.ble_key_exchanges_total,
        }));
        
        summary.insert("system".to_string(), serde_json::json!({
            "uptime_seconds": metrics.uptime_seconds,
            "memory_usage_bytes": metrics.memory_usage_bytes,
            "cpu_usage_percent": metrics.cpu_usage_percent,
            "active_connections": metrics.active_connections,
        }));
        
        summary.insert("errors".to_string(), serde_json::json!({
            "rpc_errors": metrics.rpc_errors_total,
            "auth_failures": metrics.auth_failures_total,
            "rate_limit_hits": metrics.rate_limit_hits_total,
            "blocked_devices": metrics.blocked_devices_total,
        }));
        
        summary
    }
}

impl Default for PrometheusMetrics {
    fn default() -> Self {
        Self {
            transactions_received_total: 0,
            transactions_processed_total: 0,
            transactions_failed_total: 0,
            transactions_broadcasted_total: 0,
            ble_connections_total: 0,
            ble_disconnections_total: 0,
            ble_authentications_total: 0,
            ble_key_exchanges_total: 0,
            rpc_errors_total: 0,
            gas_price_updates_total: 0,
            contract_events_total: 0,
            auth_failures_total: 0,
            rate_limit_hits_total: 0,
            blocked_devices_total: 0,
            uptime_seconds: 0.0,
            memory_usage_bytes: 0,
            cpu_usage_percent: 0.0,
            request_duration_seconds: Vec::new(),
            active_connections: 0,
            cache_hit_ratio: 0.0,
            cache_miss_ratio: 0.0,
            disk_usage_bytes: 0,
            network_bytes_received: 0,
            network_bytes_sent: 0,
        }
    }
} 