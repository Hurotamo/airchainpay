use std::collections::HashMap;
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