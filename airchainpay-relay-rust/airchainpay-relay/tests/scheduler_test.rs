use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use crate::{
    scheduler::Scheduler,
    logger::Logger,
};

pub async fn test_scheduler_initialization() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    let config = SchedulerConfig::default();
    let scheduler = Scheduler::new(config);
    
    match scheduler {
        Ok(scheduler) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Scheduler Initialization".to_string(),
                passed: true,
                error: None,
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Scheduler Initialization".to_string(),
                passed: false,
                error: Some(format!("Failed to initialize scheduler: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_job_scheduling() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    let config = SchedulerConfig::default();
    let scheduler = Scheduler::new(config);
    
    match scheduler {
        Ok(scheduler) => {
            // Test scheduling a job
            let job_id = "test_job_1";
            let job_result = scheduler.schedule_job(job_id, "test_task", Duration::from_secs(1)).await;
            
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Job Scheduling".to_string(),
                passed: job_result.is_ok(),
                error: if job_result.is_ok() { 
                    None 
                } else { 
                    Some("Failed to schedule job".to_string()) 
                },
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Job Scheduling".to_string(),
                passed: false,
                error: Some(format!("Failed to create scheduler: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_periodic_jobs() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    let config = SchedulerConfig::default();
    let scheduler = Scheduler::new(config);
    
    match scheduler {
        Ok(scheduler) => {
            // Test scheduling a periodic job
            let job_id = "periodic_job_1";
            let job_result = scheduler.schedule_periodic_job(
                job_id, 
                "periodic_task", 
                Duration::from_secs(1),
                Duration::from_secs(5)
            ).await;
            
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Periodic Jobs".to_string(),
                passed: job_result.is_ok(),
                error: if job_result.is_ok() { 
                    None 
                } else { 
                    Some("Failed to schedule periodic job".to_string()) 
                },
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Periodic Jobs".to_string(),
                passed: false,
                error: Some(format!("Failed to create scheduler: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_job_cancellation() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    let config = SchedulerConfig::default();
    let scheduler = Scheduler::new(config);
    
    match scheduler {
        Ok(scheduler) => {
            // Schedule a job
            let job_id = "cancel_job_1";
            match scheduler.schedule_job(job_id, "cancel_task", Duration::from_secs(10)).await {
                Ok(_) => {
                    // Cancel the job
                    match scheduler.cancel_job(job_id).await {
                        Ok(_) => {
                            // Check if job is cancelled
                            match scheduler.is_job_active(job_id).await {
                                Ok(is_active) => {
                                    let duration = start_time.elapsed().as_millis() as u64;
                                    crate::tests::TestResult {
                                        test_name: "Job Cancellation".to_string(),
                                        passed: !is_active,
                                        error: if !is_active { 
                                            None 
                                        } else { 
                                            Some("Job cancellation failed".to_string()) 
                                        },
                                        duration_ms: duration,
                                    }
                                }
                                Err(e) => {
                                    let duration = start_time.elapsed().as_millis() as u64;
                                    crate::tests::TestResult {
                                        test_name: "Job Cancellation".to_string(),
                                        passed: false,
                                        error: Some(format!("Failed to check job status: {}", e)),
                                        duration_ms: duration,
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Job Cancellation".to_string(),
                                passed: false,
                                error: Some(format!("Failed to cancel job: {}", e)),
                                duration_ms: duration,
                            }
                        }
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Job Cancellation".to_string(),
                        passed: false,
                        error: Some(format!("Failed to schedule job: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Job Cancellation".to_string(),
                passed: false,
                error: Some(format!("Failed to create scheduler: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_job_execution() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    let config = SchedulerConfig::default();
    let scheduler = Scheduler::new(config);
    
    match scheduler {
        Ok(scheduler) => {
            // Create a test task that sets a flag
            let (tx, mut rx) = mpsc::channel(1);
            
            let task = move || {
                let _ = tx.try_send("task_executed");
            };
            
            // Schedule the job
            let job_id = "execution_job_1";
            match scheduler.schedule_job_with_callback(job_id, task, Duration::from_secs(1)).await {
                Ok(_) => {
                    // Wait for task execution
                    match tokio::time::timeout(Duration::from_secs(3), rx.recv()).await {
                        Ok(Some(_)) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Job Execution".to_string(),
                                passed: true,
                                error: None,
                                duration_ms: duration,
                            }
                        }
                        Ok(None) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Job Execution".to_string(),
                                passed: false,
                                error: Some("Task execution timeout".to_string()),
                                duration_ms: duration,
                            }
                        }
                        Err(_) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Job Execution".to_string(),
                                passed: false,
                                error: Some("Task execution failed".to_string()),
                                duration_ms: duration,
                            }
                        }
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Job Execution".to_string(),
                        passed: false,
                        error: Some(format!("Failed to schedule job: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Job Execution".to_string(),
                passed: false,
                error: Some(format!("Failed to create scheduler: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_concurrent_jobs() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    let config = SchedulerConfig::default();
    let scheduler = Scheduler::new(config);
    
    match scheduler {
        Ok(scheduler) => {
            // Schedule multiple concurrent jobs
            let mut handles = Vec::new();
            for i in 0..5 {
                let scheduler_clone = scheduler.clone();
                let job_id = format!("concurrent_job_{}", i);
                handles.push(tokio::spawn(async move {
                    scheduler_clone.schedule_job(&job_id, "concurrent_task", Duration::from_secs(1)).await
                }));
            }
            
            let mut success_count = 0;
            for handle in handles {
                match handle.await {
                    Ok(Ok(_)) => success_count += 1,
                    _ => {}
                }
            }
            
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Concurrent Jobs".to_string(),
                passed: success_count >= 4, // At least 4 out of 5 should succeed
                error: if success_count >= 4 { 
                    None 
                } else { 
                    Some(format!("Only {} out of 5 concurrent jobs succeeded", success_count)) 
                },
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Concurrent Jobs".to_string(),
                passed: false,
                error: Some(format!("Failed to create scheduler: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_job_priorities() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    let config = SchedulerConfig::default();
    let scheduler = Scheduler::new(config);
    
    match scheduler {
        Ok(scheduler) => {
            // Schedule jobs with different priorities
            let high_priority_job = "high_priority_job";
            let low_priority_job = "low_priority_job";
            
            // Schedule low priority job first
            match scheduler.schedule_job_with_priority(low_priority_job, "low_task", Duration::from_secs(1), 1).await {
                Ok(_) => {
                    // Schedule high priority job
                    match scheduler.schedule_job_with_priority(high_priority_job, "high_task", Duration::from_secs(1), 10).await {
                        Ok(_) => {
                            // Check job priorities
                            match scheduler.get_job_priority(high_priority_job).await {
                                Ok(high_priority) => {
                                    match scheduler.get_job_priority(low_priority_job).await {
                                        Ok(low_priority) => {
                                            let duration = start_time.elapsed().as_millis() as u64;
                                            crate::tests::TestResult {
                                                test_name: "Job Priorities".to_string(),
                                                passed: high_priority > low_priority,
                                                error: if high_priority > low_priority { 
                                                    None 
                                                } else { 
                                                    Some("Job priority test failed".to_string()) 
                                                },
                                                duration_ms: duration,
                                            }
                                        }
                                        Err(e) => {
                                            let duration = start_time.elapsed().as_millis() as u64;
                                            crate::tests::TestResult {
                                                test_name: "Job Priorities".to_string(),
                                                passed: false,
                                                error: Some(format!("Failed to get low priority job priority: {}", e)),
                                                duration_ms: duration,
                                            }
                                        }
                                    }
                                }
                                Err(e) => {
                                    let duration = start_time.elapsed().as_millis() as u64;
                                    crate::tests::TestResult {
                                        test_name: "Job Priorities".to_string(),
                                        passed: false,
                                        error: Some(format!("Failed to get high priority job priority: {}", e)),
                                        duration_ms: duration,
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Job Priorities".to_string(),
                                passed: false,
                                error: Some(format!("Failed to schedule high priority job: {}", e)),
                                duration_ms: duration,
                            }
                        }
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Job Priorities".to_string(),
                        passed: false,
                        error: Some(format!("Failed to schedule low priority job: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Job Priorities".to_string(),
                passed: false,
                error: Some(format!("Failed to create scheduler: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_scheduler_cleanup() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    let config = SchedulerConfig::default();
    let scheduler = Scheduler::new(config);
    
    match scheduler {
        Ok(scheduler) => {
            // Schedule some jobs
            let job_ids = vec!["cleanup_job_1", "cleanup_job_2", "cleanup_job_3"];
            for job_id in &job_ids {
                let _ = scheduler.schedule_job(job_id, "cleanup_task", Duration::from_secs(1)).await;
            }
            
            // Cleanup all jobs
            match scheduler.cleanup_all_jobs().await {
                Ok(_) => {
                    // Check if all jobs are cleaned up
                    let mut all_cleaned = true;
                    for job_id in &job_ids {
                        match scheduler.is_job_active(job_id).await {
                            Ok(is_active) => {
                                if is_active {
                                    all_cleaned = false;
                                    break;
                                }
                            }
                            Err(_) => {
                                all_cleaned = false;
                                break;
                            }
                        }
                    }
                    
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Scheduler Cleanup".to_string(),
                        passed: all_cleaned,
                        error: if all_cleaned { 
                            None 
                        } else { 
                            Some("Scheduler cleanup failed".to_string()) 
                        },
                        duration_ms: duration,
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Scheduler Cleanup".to_string(),
                        passed: false,
                        error: Some(format!("Failed to cleanup jobs: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Scheduler Cleanup".to_string(),
                passed: false,
                error: Some(format!("Failed to create scheduler: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn run_all_scheduler_tests() -> Vec<crate::tests::TestResult> {
    let mut results = Vec::new();
    
    Logger::info("Running scheduler unit tests");
    
    results.push(test_scheduler_initialization().await);
    results.push(test_job_scheduling().await);
    results.push(test_periodic_jobs().await);
    results.push(test_job_cancellation().await);
    results.push(test_job_execution().await);
    results.push(test_concurrent_jobs().await);
    results.push(test_job_priorities().await);
    results.push(test_scheduler_cleanup().await);
    
    results
} 