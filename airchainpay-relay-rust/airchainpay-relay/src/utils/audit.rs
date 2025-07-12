use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use crate::logger::Logger;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub event_type: AuditEventType,
    pub user_id: Option<String>,
    pub device_id: Option<String>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub resource: String,
    pub action: String,
    pub details: HashMap<String, serde_json::Value>,
    pub success: bool,
    pub error_message: Option<String>,
    pub session_id: Option<String>,
    pub request_id: Option<String>,
    pub severity: AuditSeverity,
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuditEventType {
    Authentication,
    Authorization,
    Transaction,
    DeviceManagement,
    SystemOperation,
    Security,
    Configuration,
    DataAccess,
    Error,
    Performance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuditSeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditFilter {
    pub event_types: Option<Vec<AuditEventType>>,
    pub user_id: Option<String>,
    pub device_id: Option<String>,
    pub ip_address: Option<String>,
    pub success: Option<bool>,
    pub severity: Option<AuditSeverity>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub limit: Option<usize>,
}

pub struct AuditLogger {
    events: Arc<RwLock<Vec<AuditEvent>>>,
    max_events: usize,
    file_path: String,
    enabled: bool,
}

impl AuditLogger {
    pub fn new(file_path: String, max_events: usize) -> Self {
        Self {
            events: Arc::new(RwLock::new(Vec::new())),
            max_events,
            file_path,
            enabled: true,
        }
    }

    pub async fn log_event(&self, event: AuditEvent) -> Result<(), Box<dyn std::error::Error>> {
        if !self.enabled {
            return Ok(());
        }

        let mut events = self.events.write().await;
        
        // Add event to memory
        events.push(event.clone());
        
        // Maintain max events limit
        if events.len() > self.max_events {
            events.remove(0);
        }

        // Write to file
        self.write_to_file(&event).await?;

        // Log to console based on severity
        match event.severity {
            AuditSeverity::Critical => Logger::error(&format!("AUDIT CRITICAL: {:?}", event)),
            AuditSeverity::High => Logger::warn(&format!("AUDIT HIGH: {:?}", event)),
            AuditSeverity::Medium => Logger::info(&format!("AUDIT MEDIUM: {:?}", event)),
            AuditSeverity::Low => Logger::debug(&format!("AUDIT LOW: {:?}", event)),
        }

        Ok(())
    }

    pub async fn log_authentication(
        &self,
        user_id: Option<String>,
        device_id: Option<String>,
        ip_address: Option<String>,
        user_agent: Option<String>,
        success: bool,
        error_message: Option<String>,
        session_id: Option<String>,
        request_id: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let event = AuditEvent {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            event_type: AuditEventType::Authentication,
            user_id,
            device_id,
            ip_address,
            user_agent,
            resource: "auth".to_string(),
            action: if success { "login_success".to_string() } else { "login_failed".to_string() },
            details: HashMap::new(),
            success,
            error_message,
            session_id,
            request_id,
            severity: if success { AuditSeverity::Low } else { AuditSeverity::Medium },
            metadata: HashMap::new(),
        };

        self.log_event(event).await
    }

    pub async fn log_transaction(
        &self,
        user_id: Option<String>,
        device_id: Option<String>,
        ip_address: Option<String>,
        user_agent: Option<String>,
        tx_hash: Option<String>,
        chain_id: Option<u64>,
        success: bool,
        error_message: Option<String>,
        request_id: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut details = HashMap::new();
        if let Some(hash) = tx_hash {
            details.insert("tx_hash".to_string(), serde_json::Value::String(hash));
        }
        if let Some(chain) = chain_id {
            details.insert("chain_id".to_string(), serde_json::Value::Number(serde_json::Number::from(chain)));
        }

        let event = AuditEvent {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            event_type: AuditEventType::Transaction,
            user_id,
            device_id,
            ip_address,
            user_agent,
            resource: "transaction".to_string(),
            action: if success { "transaction_success".to_string() } else { "transaction_failed".to_string() },
            details,
            success,
            error_message,
            session_id: None,
            request_id,
            severity: if success { AuditSeverity::Medium } else { AuditSeverity::High },
            metadata: HashMap::new(),
        };

        self.log_event(event).await
    }

    pub async fn log_security_event(
        &self,
        user_id: Option<String>,
        device_id: Option<String>,
        ip_address: Option<String>,
        user_agent: Option<String>,
        action: String,
        details: HashMap<String, serde_json::Value>,
        severity: AuditSeverity,
        request_id: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let event = AuditEvent {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            event_type: AuditEventType::Security,
            user_id,
            device_id,
            ip_address,
            user_agent,
            resource: "security".to_string(),
            action,
            details,
            success: false,
            error_message: None,
            session_id: None,
            request_id,
            severity,
            metadata: HashMap::new(),
        };

        self.log_event(event).await
    }

    pub async fn log_device_management(
        &self,
        user_id: Option<String>,
        device_id: String,
        ip_address: Option<String>,
        user_agent: Option<String>,
        action: String,
        success: bool,
        error_message: Option<String>,
        request_id: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let event = AuditEvent {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            event_type: AuditEventType::DeviceManagement,
            user_id,
            device_id: Some(device_id),
            ip_address,
            user_agent,
            resource: "device".to_string(),
            action,
            details: HashMap::new(),
            success,
            error_message,
            session_id: None,
            request_id,
            severity: if success { AuditSeverity::Medium } else { AuditSeverity::High },
            metadata: HashMap::new(),
        };

        self.log_event(event).await
    }

    pub async fn get_events(&self, filter: Option<AuditFilter>) -> Vec<AuditEvent> {
        let events = self.events.read().await;
        
        if let Some(filter) = filter {
            events.iter()
                .filter(|event| {
                    // Filter by event type
                    if let Some(ref event_types) = filter.event_types {
                        if !event_types.contains(&event.event_type) {
                            return false;
                        }
                    }

                    // Filter by user ID
                    if let Some(ref user_id) = filter.user_id {
                        if event.user_id.as_ref() != Some(user_id) {
                            return false;
                        }
                    }

                    // Filter by device ID
                    if let Some(ref device_id) = filter.device_id {
                        if event.device_id.as_ref() != Some(device_id) {
                            return false;
                        }
                    }

                    // Filter by IP address
                    if let Some(ref ip_address) = filter.ip_address {
                        if event.ip_address.as_ref() != Some(ip_address) {
                            return false;
                        }
                    }

                    // Filter by success
                    if let Some(success) = filter.success {
                        if event.success != success {
                            return false;
                        }
                    }

                    // Filter by severity
                    if let Some(ref severity) = filter.severity {
                        if event.severity != *severity {
                            return false;
                        }
                    }

                    // Filter by time range
                    if let Some(start_time) = filter.start_time {
                        if event.timestamp < start_time {
                            return false;
                        }
                    }

                    if let Some(end_time) = filter.end_time {
                        if event.timestamp > end_time {
                            return false;
                        }
                    }

                    true
                })
                .cloned()
                .collect()
        } else {
            events.clone()
        }
    }

    pub async fn get_events_by_type(&self, event_type: AuditEventType, limit: Option<usize>) -> Vec<AuditEvent> {
        let events = self.events.read().await;
        let filtered: Vec<AuditEvent> = events.iter()
            .filter(|event| event.event_type == event_type)
            .cloned()
            .collect();

        if let Some(limit) = limit {
            filtered.into_iter().rev().take(limit).collect()
        } else {
            filtered.into_iter().rev().collect()
        }
    }

    pub async fn get_security_events(&self, limit: Option<usize>) -> Vec<AuditEvent> {
        self.get_events_by_type(AuditEventType::Security, limit).await
    }

    pub async fn get_failed_events(&self, limit: Option<usize>) -> Vec<AuditEvent> {
        let events = self.events.read().await;
        let filtered: Vec<AuditEvent> = events.iter()
            .filter(|event| !event.success)
            .cloned()
            .collect();

        if let Some(limit) = limit {
            filtered.into_iter().rev().take(limit).collect()
        } else {
            filtered.into_iter().rev().collect()
        }
    }

    pub async fn get_events_by_user(&self, user_id: &str, limit: Option<usize>) -> Vec<AuditEvent> {
        let events = self.events.read().await;
        let filtered: Vec<AuditEvent> = events.iter()
            .filter(|event| event.user_id.as_ref() == Some(&user_id.to_string()))
            .cloned()
            .collect();

        if let Some(limit) = limit {
            filtered.into_iter().rev().take(limit).collect()
        } else {
            filtered.into_iter().rev().collect()
        }
    }

    pub async fn get_events_by_device(&self, device_id: &str, limit: Option<usize>) -> Vec<AuditEvent> {
        let events = self.events.read().await;
        let filtered: Vec<AuditEvent> = events.iter()
            .filter(|event| event.device_id.as_ref() == Some(&device_id.to_string()))
            .cloned()
            .collect();

        if let Some(limit) = limit {
            filtered.into_iter().rev().take(limit).collect()
        } else {
            filtered.into_iter().rev().collect()
        }
    }

    pub async fn clear_events(&self) {
        let mut events = self.events.write().await;
        events.clear();
    }

    pub async fn export_events(&self, file_path: &str) -> Result<(), Box<dyn std::error::Error>> {
        let events = self.events.read().await;
        let json = serde_json::to_string_pretty(&*events)?;
        std::fs::write(file_path, json)?;
        Ok(())
    }

    async fn write_to_file(&self, event: &AuditEvent) -> Result<(), Box<dyn std::error::Error>> {
        use std::fs::OpenOptions;
        use std::io::Write;

        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)?;

        let mut writer = std::io::BufWriter::new(file);
        let json = serde_json::to_string(event)?;
        writeln!(writer, "{}", json)?;
        writer.flush()?;

        Ok(())
    }

    pub fn enable(&mut self) {
        self.enabled = true;
    }

    pub fn disable(&mut self) {
        self.enabled = false;
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled
    }
}

impl Default for AuditLogger {
    fn default() -> Self {
        Self::new("audit.log".to_string(), 10000)
    }
} 