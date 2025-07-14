use actix_web::{
    dev::{Service, ServiceRequest, ServiceResponse, Transform},
    Error, HttpResponse,
};
use futures::future::{ready, Ready};
use std::collections::HashSet;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use actix_web::body::BoxBody;

#[derive(Clone)]
pub struct IPWhitelistMiddleware {
    allowed_ips: HashSet<String>,
    enabled: bool,
}

impl IPWhitelistMiddleware {
    pub fn new(allowed_ips: Vec<String>) -> Self {
        Self {
            allowed_ips: allowed_ips.into_iter().collect(),
            enabled: true,
        }
    }

    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }
}

impl<S, B> Transform<S, ServiceRequest> for IPWhitelistMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type Transform = IPWhitelistService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(IPWhitelistService {
            service: Arc::new(service),
            allowed_ips: self.allowed_ips.clone(),
            enabled: self.enabled,
        }))
    }
}

pub struct IPWhitelistService<S> {
    service: Arc<S>,
    allowed_ips: HashSet<String>,
    enabled: bool,
}

impl<S, B> Service<ServiceRequest> for IPWhitelistService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static + Clone,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>>>>;

    fn poll_ready(&self, cx: &mut std::task::Context<'_>) -> std::task::Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = Arc::clone(&self.service);
        let allowed_ips = self.allowed_ips.clone();
        let enabled = self.enabled;

        Box::pin(async move {
            if !enabled {
                let fut = service.call(req);
                let res = fut.await?;
                return Ok(res.map_into_left_body());
            }

            let client_ip = req.connection_info().peer_addr()
                .unwrap_or("unknown")
                .to_string();

            if !allowed_ips.contains(&client_ip) {
                return Ok(req.into_response(
                    HttpResponse::Forbidden()
                        .json(serde_json::json!({
                            "error": "Access denied",
                            "message": "IP not in whitelist"
                        }))
                        .map_into_left_body()
                ));
            }

            // Call the inner service
            let fut = service.call(req);
            let res = fut.await?;
            Ok(res.map_into_left_body())
        })
    }
}

impl IPWhitelistMiddleware {
    pub fn is_ip_allowed(&self, ip: &str) -> bool {
        if !self.enabled {
            return true;
        }
        self.allowed_ips.contains(ip)
    }

    pub fn add_ip(&mut self, ip: String) {
        self.allowed_ips.insert(ip);
    }

    pub fn remove_ip(&mut self, ip: &str) {
        self.allowed_ips.remove(ip);
    }

    pub fn get_allowed_ips(&self) -> Vec<String> {
        self.allowed_ips.iter().cloned().collect()
    }

    pub fn validate_ip_format(ip: &str) -> bool {
        // Basic IP validation
        if ip.contains(':') {
            // IPv6
            ip.parse::<std::net::Ipv6Addr>().is_ok()
        } else {
            // IPv4
            ip.parse::<std::net::Ipv4Addr>().is_ok()
        }
    }

    pub fn parse_cidr(cidr: &str) -> Result<Vec<String>, String> {
        let parts: Vec<&str> = cidr.split('/').collect();
        if parts.len() != 2 {
            return Err("Invalid CIDR format".to_string());
        }

        let ip = parts[0];
        let bits = parts[1].parse::<u8>().map_err(|_| "Invalid bits")?;

        if !Self::validate_ip_format(ip) {
            return Err("Invalid IP format".to_string());
        }

        // For simplicity, just return the base IP
        // In a real implementation, you'd expand the CIDR range
        Ok(vec![ip.to_string()])
    }
} 