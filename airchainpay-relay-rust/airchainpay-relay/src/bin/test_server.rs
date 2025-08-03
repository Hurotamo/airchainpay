use actix_web::{App, HttpServer, web, HttpResponse, Responder, get, post};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct SendTxRequest {
    pub signed_tx: String,
    pub rpc_url: String,
    pub chain_id: u64,
}

#[get("/health")]
async fn health() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "version": "1.0.0",
        "message": "Test server is running"
    }))
}

#[post("/api/send_tx")]
async fn send_tx(req: web::Json<SendTxRequest>) -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Transaction received",
        "transaction_id": req.signed_tx,
        "chain_id": req.chain_id,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("Starting test server on port 4000...");
    
    HttpServer::new(|| {
        App::new()
            .service(health)
            .service(send_tx)
    })
    .bind(("0.0.0.0", 4000))?
    .run()
    .await
} 