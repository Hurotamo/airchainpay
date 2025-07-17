#![allow(dead_code, unused_variables)]
use std::collections::HashMap;
use std::time::SystemTime;

#[derive(Debug, Clone, Eq, Hash, PartialEq)]
pub enum CriticalPath {
    Transaction,
    Authentication,
    Blockchain,
    Database,
    Health,
}

#[derive(Debug)]
pub struct CriticalErrorHandler {
    error_counts: HashMap<CriticalPath, u32>,
    last_errors: HashMap<CriticalPath, SystemTime>,
    circuit_breaker_states: HashMap<CriticalPath, bool>,
}

impl Default for CriticalErrorHandler {
    fn default() -> Self {
        Self::new()
    }
}

impl CriticalErrorHandler {
    pub fn new() -> Self {
        Self {
            error_counts: HashMap::new(),
            last_errors: HashMap::new(),
            circuit_breaker_states: HashMap::new(),
        }
    }

    pub fn record_error(&mut self, path: CriticalPath) {
        let count = self.error_counts.entry(path.clone()).or_insert(0);
        *count += 1;
        self.last_errors.insert(path, SystemTime::now());
    }

    pub fn get_error_count(&self, path: &CriticalPath) -> u32 {
        *self.error_counts.get(path).unwrap_or(&0)
    }

    pub fn is_circuit_breaker_open(&self, path: &CriticalPath) -> bool {
        *self.circuit_breaker_states.get(path).unwrap_or(&false)
    }

    pub fn set_circuit_breaker(&mut self, path: CriticalPath, open: bool) {
        self.circuit_breaker_states.insert(path, open);
    }

    pub fn reset_circuit_breaker(&mut self, path: CriticalPath) {
        self.circuit_breaker_states.insert(path.clone(), false);
        self.error_counts.remove(&path);
        self.last_errors.remove(&path);
    }

    pub fn get_last_error_time(&self, path: &CriticalPath) -> Option<SystemTime> {
        self.last_errors.get(path).copied()
    }

    pub fn get_error_summary(&self) -> HashMap<String, u32> {
        self.error_counts
            .iter()
            .map(|(path, count)| {
                let path_str = match path {
                    CriticalPath::Transaction => "transaction",
                    CriticalPath::Authentication => "authentication",
                    CriticalPath::Blockchain => "blockchain",
                    CriticalPath::Database => "database",
                    CriticalPath::Health => "health",
                };
                (path_str.to_string(), *count)
            })
            .collect()
    }
} 