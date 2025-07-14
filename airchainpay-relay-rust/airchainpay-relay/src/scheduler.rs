use crate::ble::manager::BLEManager;
use crate::blockchain::BlockchainManager;
use crate::storage::Storage;
use crate::processors::TransactionProcessor;
use anyhow::Result;
use std::collections::{HashMap, BinaryHeap};
use std::sync::Arc;
use tokio::sync::{RwLock, Mutex};
use tokio::time::{Duration, Instant, sleep};
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledTask {
    pub id: String,
    pub name: String,
    pub cron_expression: String,
    pub task_type: TaskType,
    pub priority: TaskPriority,
    pub enabled: bool,
    pub last_run: Option<DateTime<Utc>>,
    pub next_run: Option<DateTime<Utc>>,
    pub retry_count: u32,
    pub max_retries: u32,
    pub retry_delay: Duration,
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum TaskPriority {
    Low = 1,
    Normal = 2,
    High = 3,
    Critical = 4,
}

#[derive(Debug, Clone, Serialize, Deserialize, Eq, Hash, PartialEq)]
pub enum TaskType {
    Backup,
    Cleanup,
    HealthCheck,
    MetricsCollection,
    BLEScan,
    TransactionProcessing,
    AlertCheck,
    LogRotation,
    CacheCleanup,
    DatabaseMaintenance,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub task_id: String,
    pub success: bool,
    pub duration_ms: u64,
    pub error_message: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub retry_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchedulerConfig {
    pub max_concurrent_tasks: usize,
    pub task_timeout: Duration,
    pub retry_enabled: bool,
    pub max_retries: u32,
    pub retry_delay: Duration,
    pub enable_priority_queue: bool,
    pub enable_task_history: bool,
    pub max_history_size: usize,
}

pub struct TaskQueue {
    tasks: BinaryHeap<ScheduledTask>,
    running_tasks: HashMap<String, Instant>,
    completed_tasks: Vec<TaskResult>,
}

impl TaskQueue {
    pub fn new() -> Self {
        Self {
            tasks: BinaryHeap::new(),
            running_tasks: HashMap::new(),
            completed_tasks: Vec::new(),
        }
    }

    pub fn add_task(&mut self, task: ScheduledTask) {
        self.tasks.push(task);
    }

    pub fn get_next_task(&mut self) -> Option<ScheduledTask> {
        self.tasks.pop()
    }

    pub fn mark_task_running(&mut self, task_id: &str) {
        self.running_tasks.insert(task_id.to_string(), Instant::now());
    }

    pub fn mark_task_completed(&mut self, task_id: &str) {
        self.running_tasks.remove(task_id);
    }

    pub fn add_completed_task(&mut self, result: TaskResult) {
        self.completed_tasks.push(result);
        
        // Keep only the last N completed tasks
        if self.completed_tasks.len() > 1000 {
            self.completed_tasks.remove(0);
        }
    }

    pub fn get_running_tasks(&self) -> &HashMap<String, Instant> {
        &self.running_tasks
    }

    pub fn get_completed_tasks(&self) -> &[TaskResult] {
        &self.completed_tasks
    }
}

pub struct Scheduler {
    config: SchedulerConfig,
    tasks: Arc<RwLock<HashMap<String, ScheduledTask>>>,
    queue: Arc<Mutex<TaskQueue>>,
    running: Arc<RwLock<bool>>,
    task_handlers: Arc<RwLock<HashMap<TaskType, Arc<dyn TaskHandler + Send + Sync>>>>,
}

pub trait TaskHandler {
    fn execute(&self, task: &ScheduledTask) -> Result<(), Box<dyn std::error::Error + Send + Sync>>;
    fn get_name(&self) -> &str;
}

impl Scheduler {
    pub fn new(config: SchedulerConfig) -> Self {
        Self {
            config,
            tasks: Arc::new(RwLock::new(HashMap::new())),
            queue: Arc::new(Mutex::new(TaskQueue::new())),
            running: Arc::new(RwLock::new(false)),
            task_handlers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut running = self.running.write().await;
        if *running {
            return Err("Scheduler is already running".into());
        }
        *running = true;
        drop(running);

        println!("Starting AirChainPay Relay Scheduler");

        // Start the main scheduler loop
        let scheduler_clone = self.clone();
        tokio::spawn(async move {
            scheduler_clone.run_scheduler_loop().await;
        });

        Ok(())
    }

    pub async fn stop(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut running = self.running.write().await;
        *running = false;
        println!("Stopping AirChainPay Relay Scheduler");
        Ok(())
    }

    pub async fn add_task(&self, task: ScheduledTask) -> Result<(), Box<dyn std::error::Error>> {
        let task_id = task.id.clone();
        let task_name = task.name.clone();
        
        // Store the task
        let mut tasks = self.tasks.write().await;
        tasks.insert(task_id.clone(), task.clone());
        
        // Add to queue if enabled
        if task.enabled {
            let mut queue = self.queue.lock().await;
            queue.add_task(task);
        }

        println!("Added task: {} ({})", task_name, task_id);
        Ok(())
    }

    pub async fn remove_task(&self, task_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut tasks = self.tasks.write().await;
        tasks.remove(task_id);
        println!("Removed task: {}", task_id);
        Ok(())
    }

    pub async fn enable_task(&self, task_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut tasks = self.tasks.write().await;
        if let Some(task) = tasks.get_mut(task_id) {
            task.enabled = true;
            let mut queue = self.queue.lock().await;
            queue.add_task(task.clone());
        }
        Ok(())
    }

    pub async fn disable_task(&self, task_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut tasks = self.tasks.write().await;
        if let Some(task) = tasks.get_mut(task_id) {
            task.enabled = false;
        }
        Ok(())
    }

    pub async fn register_task_handler(&self, task_type: TaskType, handler: Arc<dyn TaskHandler + Send + Sync>) {
        let mut handlers = self.task_handlers.write().await;
        handlers.insert(task_type, handler);
    }

    async fn run_scheduler_loop(&self) {
        loop {
            let running = self.running.read().await;
            if !*running {
                break;
            }
            drop(running);

            // Check for tasks that need to be executed
            self.check_and_schedule_tasks().await;

            // Process the task queue
            self.process_task_queue().await;

            // Sleep for a short interval
            sleep(Duration::from_secs(1)).await;
        }
    }

    async fn check_and_schedule_tasks(&self) {
        let now = Utc::now();
        let mut tasks = self.tasks.write().await;
        let mut queue = self.queue.lock().await;

        for task in tasks.values_mut() {
            if !task.enabled {
                continue;
            }

            // Check if task should run
            if let Some(next_run) = task.next_run {
                if now >= next_run {
                    // Calculate next run time based on cron expression
                    if let Some(next_run_time) = self.calculate_next_run(&task.cron_expression, &now) {
                        task.next_run = Some(next_run_time);
                    }

                    task.last_run = Some(now);
                    queue.add_task(task.clone());
                }
            } else {
                // First time running this task
                if let Some(next_run_time) = self.calculate_next_run(&task.cron_expression, &now) {
                    task.next_run = Some(next_run_time);
                }
            }
        }
    }

    async fn process_task_queue(&self) {
        let mut queue = self.queue.lock().await;
        // Process up to max_concurrent_tasks
        let mut processed = 0;
        while processed < self.config.max_concurrent_tasks {
            if let Some(task) = queue.get_next_task() {
                // Clone the task before spawning
                let task_clone = task.clone();
                let task_name = task.name.clone();
                let task_type = task.task_type.clone();
                
                // Spawn the task execution
                let scheduler_clone = self.clone();
                let task_type_clone = task_type.clone();
                tokio::spawn(async move {
                    // Get handler reference inside the spawned task
                    let handler_opt = {
                        let handlers = scheduler_clone.task_handlers.read().await;
                        handlers.get(&task_type_clone).cloned()
                    };
                    
                    if let Some(handler) = handler_opt {
                        let start_time = Instant::now();
                        let mut retry_count = 0;
                        let mut success = false;
                        while retry_count <= task_clone.max_retries && !success {
                            match handler.execute(&task_clone) {
                                Ok(_) => {
                                    success = true;
                                }
                                Err(e) => {
                                    retry_count += 1;
                                    println!("Task {} failed: {}", task_name, e);
                                    if retry_count <= task_clone.max_retries {
                                        println!("Task {} failed, retrying ({}/{})", task_name, retry_count, task_clone.max_retries);
                                        sleep(task_clone.retry_delay).await;
                                    }
                                }
                            }
                        }
                        let duration = start_time.elapsed();
                        if success {
                            println!("Task {} completed successfully in {}ms", task_name, duration.as_millis());
                        } else {
                            println!("Task {} failed after {} retries", task_name, retry_count);
                        }
                    } else {
                        println!("No handler found for task type: {:?}", task_type);
                    }
                });
                processed += 1;
            } else {
                break;
            }
        }
    }

    fn calculate_next_run(&self, cron_expression: &str, current_time: &DateTime<Utc>) -> Option<DateTime<Utc>> {
        // Simplified cron parsing - in production, use a proper cron library
        // This is a basic implementation that handles common patterns
        
        let parts: Vec<&str> = cron_expression.split_whitespace().collect();
        if parts.len() != 5 {
            return None;
        }

        // For now, return current time + 1 minute for simplicity
        // In production, implement proper cron parsing
        Some(*current_time + chrono::Duration::minutes(1))
    }

    pub async fn get_task_status(&self) -> HashMap<String, serde_json::Value> {
        let tasks = self.tasks.read().await;
        let queue = self.queue.lock().await;
        
        let mut status = HashMap::new();
        
        // Task counts
        status.insert("total_tasks".to_string(), serde_json::Value::Number(serde_json::Number::from(tasks.len())));
        status.insert("enabled_tasks".to_string(), serde_json::Value::Number(serde_json::Number::from(
            tasks.values().filter(|t| t.enabled).count()
        )));
        status.insert("running_tasks".to_string(), serde_json::Value::Number(serde_json::Number::from(
            queue.get_running_tasks().len()
        )));
        status.insert("completed_tasks".to_string(), serde_json::Value::Number(serde_json::Number::from(
            queue.get_completed_tasks().len()
        )));

        // Task list
        let task_list: Vec<serde_json::Value> = tasks.values().map(|task| {
            serde_json::json!({
                "id": task.id,
                "name": task.name,
                "type": format!("{:?}", task.task_type),
                "priority": format!("{:?}", task.priority),
                "enabled": task.enabled,
                "last_run": task.last_run,
                "next_run": task.next_run,
                "retry_count": task.retry_count,
            })
        }).collect();
        
        status.insert("tasks".to_string(), serde_json::Value::Array(task_list));

        status
    }

    pub async fn get_task_history(&self, limit: Option<usize>) -> Vec<TaskResult> {
        let queue = self.queue.lock().await;
        let completed_tasks = queue.get_completed_tasks();
        
        if let Some(limit) = limit {
            completed_tasks.iter().rev().take(limit).cloned().collect()
        } else {
            completed_tasks.iter().rev().cloned().collect()
        }
    }
}

impl Clone for Scheduler {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            tasks: self.tasks.clone(),
            queue: self.queue.clone(),
            running: self.running.clone(),
            task_handlers: self.task_handlers.clone(),
        }
    }
}

impl Default for SchedulerConfig {
    fn default() -> Self {
        Self {
            max_concurrent_tasks: 10,
            task_timeout: Duration::from_secs(300), // 5 minutes
            retry_enabled: true,
            max_retries: 3,
            retry_delay: Duration::from_secs(60), // 1 minute
            enable_priority_queue: true,
            enable_task_history: true,
            max_history_size: 1000,
        }
    }
}

// Implement PartialOrd and Ord for ScheduledTask to work with BinaryHeap
impl PartialOrd for ScheduledTask {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for ScheduledTask {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // Sort by priority (highest first), then by next_run time (earliest first)
        match self.priority.cmp(&other.priority) {
            std::cmp::Ordering::Equal => {
                match (self.next_run, other.next_run) {
                    (Some(self_time), Some(other_time)) => self_time.cmp(&other_time),
                    (Some(_), None) => std::cmp::Ordering::Less,
                    (None, Some(_)) => std::cmp::Ordering::Greater,
                    (None, None) => std::cmp::Ordering::Equal,
                }
            }
            other => other,
        }
    }
}

impl PartialEq for ScheduledTask {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl Eq for ScheduledTask {}

// Predefined task handlers
pub struct BackupTaskHandler;
impl TaskHandler for BackupTaskHandler {
    fn execute(&self, task: &ScheduledTask) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        println!("Executing backup task: {}", task.name);
        // Implement backup logic here
        Ok(())
    }

    fn get_name(&self) -> &str {
        "BackupTaskHandler"
    }
}

pub struct CleanupTaskHandler;
impl TaskHandler for CleanupTaskHandler {
    fn execute(&self, task: &ScheduledTask) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        println!("Executing cleanup task: {}", task.name);
        // Implement cleanup logic here
        Ok(())
    }

    fn get_name(&self) -> &str {
        "CleanupTaskHandler"
    }
}

pub struct HealthCheckTaskHandler;
impl TaskHandler for HealthCheckTaskHandler {
    fn execute(&self, task: &ScheduledTask) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        println!("Executing health check task: {}", task.name);
        // Implement health check logic here
        Ok(())
    }

    fn get_name(&self) -> &str {
        "HealthCheckTaskHandler"
    }
}

pub struct MetricsCollectionTaskHandler;
impl TaskHandler for MetricsCollectionTaskHandler {
    fn execute(&self, task: &ScheduledTask) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        println!("Executing metrics collection task: {}", task.name);
        // Implement metrics collection logic here
        Ok(())
    }

    fn get_name(&self) -> &str {
        "MetricsCollectionTaskHandler"
    }
} 