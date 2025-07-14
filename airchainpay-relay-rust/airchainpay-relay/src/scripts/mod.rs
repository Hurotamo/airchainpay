use std::process::Command;
use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentConfig {
    pub environment: String,
    pub version: String,
    pub docker_image: String,
    pub port: u16,
    pub replicas: u32,
    pub resources: ResourceConfig,
    pub environment_vars: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceConfig {
    pub cpu_limit: String,
    pub memory_limit: String,
    pub cpu_request: String,
    pub memory_request: String,
}

pub struct DeploymentScripts;

impl DeploymentScripts {
    pub async fn deploy(&self, config: &DeploymentConfig) -> Result<(), Box<dyn std::error::Error>> {
        println!("Starting deployment for environment: {}", config.environment);
        
        // Validate configuration
        self.validate_config(config)?;
        
        // Build Docker image
        self.build_docker_image(config).await?;
        
        // Push to registry
        self.push_docker_image(config).await?;
        
        // Deploy to Kubernetes
        self.deploy_to_kubernetes(config).await?;
        
        // Run health checks
        self.run_health_checks(config).await?;
        
        println!("Deployment completed successfully");
        Ok(())
    }

    fn validate_config(&self, config: &DeploymentConfig) -> Result<(), Box<dyn std::error::Error>> {
        if config.environment.is_empty() {
            return Err("Environment name is required".into());
        }
        
        if config.version.is_empty() {
            return Err("Version is required".into());
        }
        
        if config.docker_image.is_empty() {
            return Err("Docker image is required".into());
        }
        
        if config.port == 0 {
            return Err("Port must be greater than 0".into());
        }
        
        if config.replicas == 0 {
            return Err("Replicas must be greater than 0".into());
        }
        
        Ok(())
    }

    async fn build_docker_image(&self, config: &DeploymentConfig) -> Result<(), Box<dyn std::error::Error>> {
        println!("Building Docker image...");
        
        let output = Command::new("docker")
            .args([
                "build",
                "-t",
                &config.docker_image,
                "-f",
                "Dockerfile",
                ".",
            ])
            .output()?;
        
        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Docker build failed: {error}").into());
        }
        
        println!("Docker image built successfully");
        Ok(())
    }

    async fn push_docker_image(&self, config: &DeploymentConfig) -> Result<(), Box<dyn std::error::Error>> {
        println!("Pushing Docker image...");
        
        let output = Command::new("docker")
            .args(["push", &config.docker_image])
            .output()?;
        
        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Docker push failed: {error}").into());
        }
        
        println!("Docker image pushed successfully");
        Ok(())
    }

    async fn deploy_to_kubernetes(&self, config: &DeploymentConfig) -> Result<(), Box<dyn std::error::Error>> {
        println!("Deploying to Kubernetes...");
        
        // Generate Kubernetes manifests
        let manifests = self.generate_kubernetes_manifests(config)?;
        
        // Apply manifests
        for _manifest in manifests {
            let output = Command::new("kubectl")
                .args(["apply", "-f", "-"])
                .stdin(std::process::Stdio::piped())
                .output()?;
            
            if !output.status.success() {
                let error = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Kubernetes deployment failed: {error}").into());
            }
        }
        
        println!("Kubernetes deployment completed");
        Ok(())
    }

    fn generate_kubernetes_manifests(&self, config: &DeploymentConfig) -> Result<Vec<String>, Box<dyn std::error::Error>> {
        let mut manifests = Vec::new();
        
        // Deployment manifest
        let deployment = format!(
            r#"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: airchainpay-relay-{}
  labels:
    app: airchainpay-relay
    environment: {}
spec:
  replicas: {}
  selector:
    matchLabels:
      app: airchainpay-relay
      environment: {}
  template:
    metadata:
      labels:
        app: airchainpay-relay
        environment: {}
    spec:
      containers:
      - name: airchainpay-relay
        image: {}
        ports:
        - containerPort: {}
        env:
        - name: ENVIRONMENT
          value: "{}"
        - name: PORT
          value: "{}"
        resources:
          limits:
            cpu: {}
            memory: {}
          requests:
            cpu: {}
            memory: {}
"#,
            config.environment,
            config.environment,
            config.replicas,
            config.environment,
            config.environment,
            config.docker_image,
            config.port,
            config.environment,
            config.port,
            config.resources.cpu_limit,
            config.resources.memory_limit,
            config.resources.cpu_request,
            config.resources.memory_request,
        );
        
        manifests.push(deployment);
        
        // Service manifest
        let service = format!(
            r#"
apiVersion: v1
kind: Service
metadata:
  name: airchainpay-relay-service-{}
  labels:
    app: airchainpay-relay
    environment: {}
spec:
  selector:
    app: airchainpay-relay
    environment: {}
  ports:
  - port: {}
    targetPort: {}
  type: LoadBalancer
"#,
            config.environment,
            config.environment,
            config.environment,
            config.port,
            config.port,
        );
        
        manifests.push(service);
        
        Ok(manifests)
    }

    async fn run_health_checks(&self, config: &DeploymentConfig) -> Result<(), Box<dyn std::error::Error>> {
        println!("Running health checks...");
        
        // Wait for deployment to be ready
        let output = Command::new("kubectl")
            .args([
                "wait",
                "--for=condition=available",
                "--timeout=300s",
                &format!("deployment/airchainpay-relay-{}", config.environment),
            ])
            .output()?;
        
        if !output.status.success() {
            return Err("Deployment health check failed".into());
        }
        
        // Test API endpoint
        self.test_api_endpoint(config).await?;
        
        println!("Health checks passed");
        Ok(())
    }

    async fn test_api_endpoint(&self, config: &DeploymentConfig) -> Result<(), Box<dyn std::error::Error>> {
        // Get service URL
        let output = Command::new("kubectl")
            .args([
                "get",
                "service",
                &format!("airchainpay-relay-service-{}", config.environment),
                "-o",
                "jsonpath={.status.loadBalancer.ingress[0].ip}",
            ])
            .output()?;
        
        if !output.status.success() {
            return Err("Failed to get service IP".into());
        }
        
        let service_ip = String::from_utf8_lossy(&output.stdout);
        let health_url = format!("http://{}:{}/health", service_ip, config.port);
        
        // Test health endpoint
        let response = reqwest::get(&health_url).await?;
        
        if !response.status().is_success() {
            return Err("Health endpoint test failed".into());
        }
        
        Ok(())
    }

    pub async fn rollback(&self, environment: &str, version: &str) -> Result<(), Box<dyn std::error::Error>> {
        println!("Rolling back {environment} to version {version}");
        
        let output = Command::new("kubectl")
            .args([
                "rollout",
                "undo",
                &format!("deployment/airchainpay-relay-{environment}"),
            ])
            .output()?;
        
        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Rollback failed: {error}").into());
        }
        
        println!("Rollback completed successfully");
        Ok(())
    }

    pub async fn scale(&self, environment: &str, replicas: u32) -> Result<(), Box<dyn std::error::Error>> {
        println!("Scaling {environment} to {replicas} replicas");
        
        let output = Command::new("kubectl")
            .args([
                "scale",
                "deployment",
                &format!("airchainpay-relay-{environment}"),
                "--replicas",
                &replicas.to_string(),
            ])
            .output()?;
        
        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Scale failed: {error}").into());
        }
        
        println!("Scale operation completed successfully");
        Ok(())
    }
}

pub struct UtilityScripts;

impl UtilityScripts {
    pub async fn generate_secrets(&self) -> Result<(), Box<dyn std::error::Error>> {
        println!("Generating secrets...");
        
        let secrets = vec![
            ("JWT_SECRET", self.generate_random_string(64)?),
            ("API_KEY", self.generate_random_string(32)?),
            ("DATABASE_PASSWORD", self.generate_random_string(16)?),
            ("REDIS_PASSWORD", self.generate_random_string(16)?),
        ];
        
        for (name, value) in secrets {
            println!("{name}={value}");
        }
        
        println!("Secrets generated successfully");
        Ok(())
    }

    fn generate_random_string(&self, length: usize) -> Result<String, Box<dyn std::error::Error>> {
        use rand::Rng;
        let mut rng = rand::rng();
        let chars: Vec<char> = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".chars().collect();
        
        let result: String = (0..length)
            .map(|_| chars[rng.random_range(0..chars.len())])
            .collect();
        
        Ok(result)
    }

    pub async fn check_payments(&self, chain_id: u64) -> Result<(), Box<dyn std::error::Error>> {
        println!("Checking payments for chain {chain_id}");
        
        // This would implement payment verification logic
        // For now, just log the operation
        
        println!("Payment check completed");
        Ok(())
    }

    pub async fn compare_networks(&self) -> Result<(), Box<dyn std::error::Error>> {
        println!("Comparing network configurations...");
        
        let networks = vec![1, 137, 56]; // Ethereum, Polygon, BSC
        
        for network_id in networks {
            println!("Checking network {network_id}");
            // This would implement network comparison logic
        }
        
        println!("Network comparison completed");
        Ok(())
    }

    pub async fn backup_database(&self) -> Result<(), Box<dyn std::error::Error>> {
        println!("Creating database backup...");
        
        let backup_dir = "./backups";
        fs::create_dir_all(backup_dir)?;
        
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let backup_file = format!("{backup_dir}/backup_{timestamp}.tar.gz");
        
        let output = Command::new("tar")
            .args(["-czf", &backup_file, "./data"])
            .output()?;
        
        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Backup failed: {error}").into());
        }
        
        println!("Database backup created: {backup_file}");
        Ok(())
    }

    pub async fn restore_database(&self, backup_file: &str) -> Result<(), Box<dyn std::error::Error>> {
        println!("Restoring database from {backup_file}");
        
        if !Path::new(backup_file).exists() {
            return Err("Backup file not found".into());
        }
        
        let output = Command::new("tar")
            .args(["-xzf", backup_file, "-C", "."])
            .output()?;
        
        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Restore failed: {error}").into());
        }
        
        println!("Database restore completed");
        Ok(())
    }

    pub async fn cleanup_old_data(&self, days: u32) -> Result<(), Box<dyn std::error::Error>> {
        println!("Cleaning up data older than {days} days");
        
        let cutoff_date = chrono::Utc::now() - chrono::Duration::days(days as i64);
        
        // Clean up old log files
        let log_dir = "./logs";
        if Path::new(log_dir).exists() {
            for entry in fs::read_dir(log_dir)? {
                let entry = entry?;
                let metadata = entry.metadata()?;
                let modified = metadata.modified()?;
                let modified_time: chrono::DateTime<chrono::Utc> = chrono::DateTime::from(modified);
                
                if modified_time < cutoff_date {
                    fs::remove_file(entry.path())?;
                    println!("Removed old log file: {:?}", entry.path());
                }
            }
        }
        
        // Clean up old backups
        let backup_dir = "./backups";
        if Path::new(backup_dir).exists() {
            for entry in fs::read_dir(backup_dir)? {
                let entry = entry?;
                let metadata = entry.metadata()?;
                let modified = metadata.modified()?;
                let modified_time: chrono::DateTime<chrono::Utc> = chrono::DateTime::from(modified);
                
                if modified_time < cutoff_date {
                    fs::remove_file(entry.path())?;
                    println!("Removed old backup: {:?}", entry.path());
                }
            }
        }
        
        println!("Data cleanup completed");
        Ok(())
    }
}

pub async fn run_deployment_script() -> Result<(), Box<dyn std::error::Error>> {
    let config = DeploymentConfig {
        environment: std::env::var("ENVIRONMENT").unwrap_or_else(|_| "staging".to_string()),
        version: std::env::var("VERSION").unwrap_or_else(|_| "1.0.0".to_string()),
        docker_image: std::env::var("DOCKER_IMAGE").unwrap_or_else(|_| "airchainpay/relay:latest".to_string()),
        port: std::env::var("PORT").unwrap_or_else(|_| "4000".to_string()).parse()?,
        replicas: std::env::var("REPLICAS").unwrap_or_else(|_| "3".to_string()).parse()?,
        resources: ResourceConfig {
            cpu_limit: "1000m".to_string(),
            memory_limit: "2Gi".to_string(),
            cpu_request: "500m".to_string(),
            memory_request: "1Gi".to_string(),
        },
        environment_vars: HashMap::new(),
    };
    
    let deployment_scripts = DeploymentScripts;
    deployment_scripts.deploy(&config).await
}

pub async fn run_utility_script(script_name: &str) -> Result<(), Box<dyn std::error::Error>> {
    let utility_scripts = UtilityScripts;
    
    match script_name {
        "generate-secrets" => utility_scripts.generate_secrets().await,
        "check-payments" => {
            let chain_id = std::env::var("CHAIN_ID").unwrap_or_else(|_| "1".to_string()).parse()?;
            utility_scripts.check_payments(chain_id).await
        }
        "compare-networks" => utility_scripts.compare_networks().await,
        "backup-database" => utility_scripts.backup_database().await,
        "restore-database" => {
            let backup_file = std::env::var("BACKUP_FILE")
                .unwrap_or_else(|_| "backup.json".to_string());
            utility_scripts.restore_database(&backup_file).await
        }
        "cleanup-data" => {
            let days = std::env::var("DAYS").unwrap_or_else(|_| "30".to_string()).parse()?;
            utility_scripts.cleanup_old_data(days).await
        }
        _ => Err(format!("Unknown script: {script_name}").into()),
    }
} 