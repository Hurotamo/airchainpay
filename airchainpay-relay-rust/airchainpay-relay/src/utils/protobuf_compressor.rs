use anyhow::{Result, anyhow};
use bytes::Bytes;
use cbor4ii::core::Value as CborValue;
use cbor4ii::{Decode, Encode};
use prost::Message;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// Include the generated protobuf code
pub mod airchainpay {
    tonic::include_proto!("airchainpay");
}

use airchainpay::{
    ble_payment_data::BlePaymentData,
    encrypted_transaction_payload::EncryptedTransactionPayload,
    payment_metadata::PaymentMetadata,
    qr_payment_request::QrPaymentRequest,
    token::Token,
    transaction_payload::TransactionPayload,
    transaction_result::TransactionResult,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecompressionResult {
    pub data: serde_json::Value,
    pub format: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressionStats {
    pub original_size: usize,
    pub compressed_size: usize,
    pub compression_ratio: f64,
    pub space_saved_percent: f64,
    pub format: String,
}

pub struct ProtobufCompressor {
    is_initialized: bool,
}

impl ProtobufCompressor {
    pub fn new() -> Self {
        Self {
            is_initialized: false,
        }
    }

    pub fn initialize(&mut self) -> Result<()> {
        if self.is_initialized {
            return Ok(());
        }

        // In Rust, we don't need to load protobuf schemas dynamically
        // as they're compiled at build time
        self.is_initialized = true;
        Ok(())
    }

    /// Decompress transaction payload using Protobuf and CBOR
    pub async fn decompress_transaction_payload(&mut self, compressed_data: &[u8]) -> Result<DecompressionResult> {
        self.initialize()?;

        match self.try_decompress_protobuf_cbor(compressed_data, "transaction") {
            Ok(result) => Ok(result),
            Err(e) => {
                // Fallback to JSON parsing
                match self.try_json_fallback(compressed_data) {
                    Ok(json_result) => Ok(json_result),
                    Err(_) => Err(anyhow!("Failed to decompress transaction payload: {}", e)),
                }
            }
        }
    }

    /// Decompress BLE payment data using Protobuf and CBOR
    pub async fn decompress_ble_payment_data(&mut self, compressed_data: &[u8]) -> Result<DecompressionResult> {
        self.initialize()?;

        match self.try_decompress_protobuf_cbor(compressed_data, "ble") {
            Ok(result) => Ok(result),
            Err(e) => {
                // Fallback to JSON parsing
                match self.try_json_fallback(compressed_data) {
                    Ok(json_result) => Ok(json_result),
                    Err(_) => Err(anyhow!("Failed to decompress BLE payment data: {}", e)),
                }
            }
        }
    }

    /// Decompress QR payment request using Protobuf and CBOR
    pub async fn decompress_qr_payment_request(&mut self, compressed_data: &[u8]) -> Result<DecompressionResult> {
        self.initialize()?;

        match self.try_decompress_protobuf_cbor(compressed_data, "qr") {
            Ok(result) => Ok(result),
            Err(e) => {
                // Fallback to JSON parsing
                match self.try_json_fallback(compressed_data) {
                    Ok(json_result) => Ok(json_result),
                    Err(_) => Err(anyhow!("Failed to decompress QR payment request: {}", e)),
                }
            }
        }
    }

    /// Try to decompress data with fallback to JSON
    pub async fn decompress_with_fallback(&mut self, compressed_data: &[u8], payload_type: &str) -> Result<serde_json::Value> {
        let result = match payload_type {
            "ble" => self.decompress_ble_payment_data(compressed_data).await,
            "qr" => self.decompress_qr_payment_request(compressed_data).await,
            _ => self.decompress_transaction_payload(compressed_data).await,
        }?;

        if result.success {
            Ok(result.data)
        } else {
            Err(anyhow!("Decompression failed: {}", result.error.unwrap_or_default()))
        }
    }

    /// Auto-detect payload format and decompress accordingly
    pub async fn auto_decompress(&mut self, data: &[u8]) -> Result<serde_json::Value> {
        // Check if data is base64 encoded
        if let Ok(decoded) = base64::decode(data) {
            // Try to decode as CBOR
            if let Ok(cbor_value) = CborValue::decode(&decoded[..]) {
                // If successful, it's likely a compressed payload
                return self.decompress_with_fallback(&decoded, "transaction").await;
            }
        }

        // Try JSON parsing
        match serde_json::from_slice::<serde_json::Value>(data) {
            Ok(json_value) => Ok(json_value),
            Err(_) => Err(anyhow!("Failed to auto decompress payload")),
        }
    }

    /// Compress transaction payload using Protobuf and CBOR
    pub async fn compress_transaction_payload(&mut self, transaction_data: &serde_json::Value) -> Result<Vec<u8>> {
        self.initialize()?;

        // Convert JSON to protobuf message
        let payload = self.json_to_transaction_payload(transaction_data)?;
        
        // Encode as protobuf
        let mut protobuf_data = Vec::new();
        payload.encode(&mut protobuf_data)?;

        // Compress with CBOR
        let cbor_value = CborValue::Bytes(protobuf_data);
        let mut compressed_data = Vec::new();
        cbor_value.encode(&mut compressed_data)?;

        Ok(compressed_data)
    }

    /// Compress BLE payment data using Protobuf and CBOR
    pub async fn compress_ble_payment_data(&mut self, ble_data: &serde_json::Value) -> Result<Vec<u8>> {
        self.initialize()?;

        // Convert JSON to protobuf message
        let payload = self.json_to_ble_payment_data(ble_data)?;
        
        // Encode as protobuf
        let mut protobuf_data = Vec::new();
        payload.encode(&mut protobuf_data)?;

        // Compress with CBOR
        let cbor_value = CborValue::Bytes(protobuf_data);
        let mut compressed_data = Vec::new();
        cbor_value.encode(&mut compressed_data)?;

        Ok(compressed_data)
    }

    /// Compress QR payment request using Protobuf and CBOR
    pub async fn compress_qr_payment_request(&mut self, qr_data: &serde_json::Value) -> Result<Vec<u8>> {
        self.initialize()?;

        // Convert JSON to protobuf message
        let payload = self.json_to_qr_payment_request(qr_data)?;
        
        // Encode as protobuf
        let mut protobuf_data = Vec::new();
        payload.encode(&mut protobuf_data)?;

        // Compress with CBOR
        let cbor_value = CborValue::Bytes(protobuf_data);
        let mut compressed_data = Vec::new();
        cbor_value.encode(&mut compressed_data)?;

        Ok(compressed_data)
    }

    /// Get compression statistics
    pub fn get_compression_stats(&self, original_size: usize, compressed_size: usize) -> CompressionStats {
        let compression_ratio = compressed_size as f64 / original_size as f64;
        let space_saved_percent = (1.0 - compression_ratio) * 100.0;

        CompressionStats {
            original_size,
            compressed_size,
            compression_ratio,
            space_saved_percent,
            format: "protobuf_cbor".to_string(),
        }
    }

    // Private helper methods

    fn try_decompress_protobuf_cbor(&self, compressed_data: &[u8], payload_type: &str) -> Result<DecompressionResult> {
        // Decode CBOR first
        let cbor_value = CborValue::decode(compressed_data)
            .map_err(|e| anyhow!("CBOR decode failed: {}", e))?;

        let protobuf_data = match cbor_value {
            CborValue::Bytes(data) => data,
            _ => return Err(anyhow!("Expected CBOR bytes, got different type")),
        };

        // Decode protobuf based on type
        let json_value = match payload_type {
            "transaction" => {
                let payload = TransactionPayload::decode(protobuf_data.as_slice())?;
                self.transaction_payload_to_json(payload)?
            }
            "ble" => {
                let payload = BlePaymentData::decode(protobuf_data.as_slice())?;
                self.ble_payment_data_to_json(payload)?
            }
            "qr" => {
                let payload = QrPaymentRequest::decode(protobuf_data.as_slice())?;
                self.qr_payment_request_to_json(payload)?
            }
            _ => return Err(anyhow!("Unknown payload type: {}", payload_type)),
        };

        Ok(DecompressionResult {
            data: json_value,
            format: "protobuf_cbor".to_string(),
            success: true,
            error: None,
        })
    }

    fn try_json_fallback(&self, data: &[u8]) -> Result<DecompressionResult> {
        match serde_json::from_slice::<serde_json::Value>(data) {
            Ok(json_value) => Ok(DecompressionResult {
                data: json_value,
                format: "json".to_string(),
                success: true,
                error: None,
            }),
            Err(e) => Ok(DecompressionResult {
                data: serde_json::Value::Null,
                format: "json".to_string(),
                success: false,
                error: Some(format!("JSON parsing failed: {}", e)),
            }),
        }
    }

    fn json_to_transaction_payload(&self, json: &serde_json::Value) -> Result<TransactionPayload> {
        let obj = json.as_object()
            .ok_or_else(|| anyhow!("Expected JSON object"))?;

        let token = if let Some(token_json) = obj.get("token") {
            self.json_to_token(token_json)?
        } else {
            Token::default()
        };

        let metadata = if let Some(metadata_json) = obj.get("metadata") {
            self.json_to_payment_metadata(metadata_json)?
        } else {
            PaymentMetadata::default()
        };

        Ok(TransactionPayload {
            to: obj.get("to").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            amount: obj.get("amount").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            chain_id: obj.get("chainId").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            token: Some(token),
            payment_reference: obj.get("paymentReference").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            metadata: Some(metadata),
            timestamp: obj.get("timestamp").and_then(|v| v.as_u64()).unwrap_or(0),
            version: obj.get("version").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            r#type: obj.get("type").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        })
    }

    fn json_to_ble_payment_data(&self, json: &serde_json::Value) -> Result<BlePaymentData> {
        let obj = json.as_object()
            .ok_or_else(|| anyhow!("Expected JSON object"))?;

        let token = if let Some(token_json) = obj.get("token") {
            self.json_to_token(token_json)?
        } else {
            Token::default()
        };

        let metadata = if let Some(metadata_json) = obj.get("metadata") {
            self.json_to_payment_metadata(metadata_json)?
        } else {
            PaymentMetadata::default()
        };

        Ok(BlePaymentData {
            r#type: obj.get("type").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            to: obj.get("to").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            amount: obj.get("amount").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            chain_id: obj.get("chainId").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            payment_reference: obj.get("paymentReference").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            timestamp: obj.get("timestamp").and_then(|v| v.as_u64()).unwrap_or(0),
            token: Some(token),
            metadata: Some(metadata),
        })
    }

    fn json_to_qr_payment_request(&self, json: &serde_json::Value) -> Result<QrPaymentRequest> {
        let obj = json.as_object()
            .ok_or_else(|| anyhow!("Expected JSON object"))?;

        let token = if let Some(token_json) = obj.get("token") {
            self.json_to_token(token_json)?
        } else {
            Token::default()
        };

        let metadata = if let Some(metadata_json) = obj.get("metadata") {
            self.json_to_payment_metadata(metadata_json)?
        } else {
            PaymentMetadata::default()
        };

        Ok(QrPaymentRequest {
            r#type: obj.get("type").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            to: obj.get("to").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            amount: obj.get("amount").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            chain_id: obj.get("chainId").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            token: Some(token),
            payment_reference: obj.get("paymentReference").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            metadata: Some(metadata),
            timestamp: obj.get("timestamp").and_then(|v| v.as_u64()).unwrap_or(0),
            version: obj.get("version").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        })
    }

    fn json_to_token(&self, json: &serde_json::Value) -> Result<Token> {
        let obj = json.as_object()
            .ok_or_else(|| anyhow!("Expected JSON object for token"))?;

        Ok(Token {
            symbol: obj.get("symbol").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            name: obj.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            decimals: obj.get("decimals").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
            address: obj.get("address").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            chain_id: obj.get("chainId").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            is_native: obj.get("isNative").and_then(|v| v.as_bool()).unwrap_or(false),
        })
    }

    fn json_to_payment_metadata(&self, json: &serde_json::Value) -> Result<PaymentMetadata> {
        let obj = json.as_object()
            .ok_or_else(|| anyhow!("Expected JSON object for metadata"))?;

        let mut extra = HashMap::new();
        if let Some(extra_obj) = obj.get("extra").and_then(|v| v.as_object()) {
            for (key, value) in extra_obj {
                if let Some(str_value) = value.as_str() {
                    extra.insert(key.clone(), str_value.to_string());
                }
            }
        }

        Ok(PaymentMetadata {
            merchant: obj.get("merchant").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            location: obj.get("location").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            max_amount: obj.get("maxAmount").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            min_amount: obj.get("minAmount").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            expiry: obj.get("expiry").and_then(|v| v.as_u64()).unwrap_or(0),
            timestamp: obj.get("timestamp").and_then(|v| v.as_u64()).unwrap_or(0),
            extra,
        })
    }

    fn transaction_payload_to_json(&self, payload: TransactionPayload) -> Result<serde_json::Value> {
        let mut obj = serde_json::Map::new();
        
        obj.insert("to".to_string(), serde_json::Value::String(payload.to));
        obj.insert("amount".to_string(), serde_json::Value::String(payload.amount));
        obj.insert("chainId".to_string(), serde_json::Value::String(payload.chain_id));
        obj.insert("paymentReference".to_string(), serde_json::Value::String(payload.payment_reference));
        obj.insert("timestamp".to_string(), serde_json::Value::Number(payload.timestamp.into()));
        obj.insert("version".to_string(), serde_json::Value::String(payload.version));
        obj.insert("type".to_string(), serde_json::Value::String(payload.r#type));

        if let Some(token) = payload.token {
            obj.insert("token".to_string(), self.token_to_json(token)?);
        }

        if let Some(metadata) = payload.metadata {
            obj.insert("metadata".to_string(), self.payment_metadata_to_json(metadata)?);
        }

        Ok(serde_json::Value::Object(obj))
    }

    fn ble_payment_data_to_json(&self, payload: BlePaymentData) -> Result<serde_json::Value> {
        let mut obj = serde_json::Map::new();
        
        obj.insert("type".to_string(), serde_json::Value::String(payload.r#type));
        obj.insert("to".to_string(), serde_json::Value::String(payload.to));
        obj.insert("amount".to_string(), serde_json::Value::String(payload.amount));
        obj.insert("chainId".to_string(), serde_json::Value::String(payload.chain_id));
        obj.insert("paymentReference".to_string(), serde_json::Value::String(payload.payment_reference));
        obj.insert("timestamp".to_string(), serde_json::Value::Number(payload.timestamp.into()));

        if let Some(token) = payload.token {
            obj.insert("token".to_string(), self.token_to_json(token)?);
        }

        if let Some(metadata) = payload.metadata {
            obj.insert("metadata".to_string(), self.payment_metadata_to_json(metadata)?);
        }

        Ok(serde_json::Value::Object(obj))
    }

    fn qr_payment_request_to_json(&self, payload: QrPaymentRequest) -> Result<serde_json::Value> {
        let mut obj = serde_json::Map::new();
        
        obj.insert("type".to_string(), serde_json::Value::String(payload.r#type));
        obj.insert("to".to_string(), serde_json::Value::String(payload.to));
        obj.insert("amount".to_string(), serde_json::Value::String(payload.amount));
        obj.insert("chainId".to_string(), serde_json::Value::String(payload.chain_id));
        obj.insert("paymentReference".to_string(), serde_json::Value::String(payload.payment_reference));
        obj.insert("timestamp".to_string(), serde_json::Value::Number(payload.timestamp.into()));
        obj.insert("version".to_string(), serde_json::Value::String(payload.version));

        if let Some(token) = payload.token {
            obj.insert("token".to_string(), self.token_to_json(token)?);
        }

        if let Some(metadata) = payload.metadata {
            obj.insert("metadata".to_string(), self.payment_metadata_to_json(metadata)?);
        }

        Ok(serde_json::Value::Object(obj))
    }

    fn token_to_json(&self, token: Token) -> Result<serde_json::Value> {
        let mut obj = serde_json::Map::new();
        
        obj.insert("symbol".to_string(), serde_json::Value::String(token.symbol));
        obj.insert("name".to_string(), serde_json::Value::String(token.name));
        obj.insert("decimals".to_string(), serde_json::Value::Number(token.decimals.into()));
        obj.insert("address".to_string(), serde_json::Value::String(token.address));
        obj.insert("chainId".to_string(), serde_json::Value::String(token.chain_id));
        obj.insert("isNative".to_string(), serde_json::Value::Bool(token.is_native));

        Ok(serde_json::Value::Object(obj))
    }

    fn payment_metadata_to_json(&self, metadata: PaymentMetadata) -> Result<serde_json::Value> {
        let mut obj = serde_json::Map::new();
        
        obj.insert("merchant".to_string(), serde_json::Value::String(metadata.merchant));
        obj.insert("location".to_string(), serde_json::Value::String(metadata.location));
        obj.insert("maxAmount".to_string(), serde_json::Value::String(metadata.max_amount));
        obj.insert("minAmount".to_string(), serde_json::Value::String(metadata.min_amount));
        obj.insert("expiry".to_string(), serde_json::Value::Number(metadata.expiry.into()));
        obj.insert("timestamp".to_string(), serde_json::Value::Number(metadata.timestamp.into()));

        let mut extra_obj = serde_json::Map::new();
        for (key, value) in metadata.extra {
            extra_obj.insert(key, serde_json::Value::String(value));
        }
        obj.insert("extra".to_string(), serde_json::Value::Object(extra_obj));

        Ok(serde_json::Value::Object(obj))
    }
}

impl Default for ProtobufCompressor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_compress_decompress_transaction() {
        let mut compressor = ProtobufCompressor::new();
        
        let transaction_data = json!({
            "to": "0x1234567890123456789012345678901234567890",
            "amount": "1000000000000000000",
            "chainId": "1",
            "token": {
                "symbol": "ETH",
                "name": "Ethereum",
                "decimals": 18,
                "address": "0x0000000000000000000000000000000000000000",
                "chainId": "1",
                "isNative": true
            },
            "paymentReference": "ref123",
            "metadata": {
                "merchant": "Test Merchant",
                "location": "Test Location",
                "maxAmount": "10000000000000000000",
                "minAmount": "100000000000000000",
                "expiry": 1640995200,
                "timestamp": 1640995200,
                "extra": {
                    "key1": "value1",
                    "key2": "value2"
                }
            },
            "timestamp": 1640995200,
            "version": "1.0.0",
            "type": "payment"
        });

        let compressed = compressor.compress_transaction_payload(&transaction_data).await.unwrap();
        let decompressed = compressor.decompress_transaction_payload(&compressed).await.unwrap();

        assert!(decompressed.success);
        assert_eq!(decompressed.format, "protobuf_cbor");
        assert_eq!(decompressed.data, transaction_data);
    }

    #[tokio::test]
    async fn test_compress_decompress_ble_payment() {
        let mut compressor = ProtobufCompressor::new();
        
        let ble_data = json!({
            "type": "payment",
            "to": "0x1234567890123456789012345678901234567890",
            "amount": "1000000000000000000",
            "chainId": "1",
            "paymentReference": "ref123",
            "timestamp": 1640995200,
            "token": {
                "symbol": "ETH",
                "name": "Ethereum",
                "decimals": 18,
                "address": "0x0000000000000000000000000000000000000000",
                "chainId": "1",
                "isNative": true
            },
            "metadata": {
                "merchant": "Test Merchant",
                "location": "Test Location",
                "maxAmount": "10000000000000000000",
                "minAmount": "100000000000000000",
                "expiry": 1640995200,
                "timestamp": 1640995200,
                "extra": {
                    "key1": "value1"
                }
            }
        });

        let compressed = compressor.compress_ble_payment_data(&ble_data).await.unwrap();
        let decompressed = compressor.decompress_ble_payment_data(&compressed).await.unwrap();

        assert!(decompressed.success);
        assert_eq!(decompressed.format, "protobuf_cbor");
        assert_eq!(decompressed.data, ble_data);
    }

    #[tokio::test]
    async fn test_json_fallback() {
        let mut compressor = ProtobufCompressor::new();
        
        let json_data = json!({
            "test": "data",
            "number": 123
        });

        let json_bytes = serde_json::to_vec(&json_data).unwrap();
        let result = compressor.auto_decompress(&json_bytes).await.unwrap();

        assert_eq!(result, json_data);
    }

    #[test]
    fn test_compression_stats() {
        let compressor = ProtobufCompressor::new();
        let stats = compressor.get_compression_stats(1000, 500);

        assert_eq!(stats.original_size, 1000);
        assert_eq!(stats.compressed_size, 500);
        assert_eq!(stats.compression_ratio, 0.5);
        assert_eq!(stats.space_saved_percent, 50.0);
        assert_eq!(stats.format, "protobuf_cbor");
    }
} 