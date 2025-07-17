#![allow(dead_code, unused_variables)]
use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use base64::{engine::general_purpose, Engine as _};
use std::io::Write;

// Include the generated protobuf code
pub mod airchainpay {
    tonic::include_proto!("airchainpay");
}

// Remove all QR payment and BLE payment compression/decompression logic, types, and comments. Only generic transaction payload compression remains.
#[derive(Clone, prost::Message)]
pub struct TransactionPayload {
    #[prost(string, tag = "1")]
    pub data: String,
}

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
        
        // Try to decompress using LZ4 first
        let mut decompressed = Vec::new();
        let mut decoder = lz4::Decoder::new(compressed_data)
            .map_err(|e| anyhow::anyhow!("LZ4 decompression failed: {}", e))?;
        
        std::io::copy(&mut decoder, &mut decompressed)
            .map_err(|e| anyhow::anyhow!("Failed to read decompressed data: {}", e))?;
        
        // Try to deserialize as CBOR
        match cbor4ii::serde::from_slice::<serde_json::Value>(&decompressed) {
            Ok(data) => {
                Ok(DecompressionResult {
                    data,
                    format: "protobuf_cbor".to_string(),
                    success: true,
                    error: None,
                })
            }
            Err(e) => {
                // Fallback to JSON
                match serde_json::from_slice::<serde_json::Value>(compressed_data) {
                    Ok(data) => {
                        Ok(DecompressionResult {
                            data,
                            format: "json".to_string(),
                            success: true,
                            error: None,
                        })
                    }
                    Err(_) => {
                        Ok(DecompressionResult {
                            data: serde_json::Value::Null,
                            format: "unknown".to_string(),
                            success: false,
                            error: Some(format!("Failed to decompress: {}", e)),
                        })
                    }
                }
            }
        }
    }

    /// Auto-detect payload format and decompress accordingly
    pub async fn auto_decompress(&mut self, data: &[u8]) -> Result<serde_json::Value> {
        // Check if data is base64 encoded
        if let Ok(_decoded) = general_purpose::STANDARD.decode(data) {
            // Try to decode as CBOR
            // if let Ok(cbor_value) = CborValue::decode(&decoded[..]) {
            //     // If successful, it's likely a compressed payload
            //     return self.decompress_with_fallback(&decoded, "transaction").await;
            // }
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
        
        // Convert JSON to CBOR for compression
        let cbor_data = cbor4ii::serde::to_vec(Vec::new(), transaction_data)
            .map_err(|e| anyhow::anyhow!("CBOR serialization failed: {}", e))?;
        
        // Use LZ4 compression on the CBOR data
        let mut compressed = Vec::new();
        let mut encoder = lz4::EncoderBuilder::new()
            .level(1) // Fast compression
            .build(&mut compressed)
            .map_err(|e| anyhow::anyhow!("LZ4 compression failed: {}", e))?;
        
        encoder.write_all(&cbor_data)
            .map_err(|e| anyhow::anyhow!("Failed to write data for compression: {}", e))?;
        
        let (compressed, result) = encoder.finish();
        result.map_err(|e| anyhow::anyhow!("Failed to finish compression: {}", e))?;
        Ok(compressed.to_vec())
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

    fn try_decompress_protobuf_cbor(&self, _compressed_data: &[u8], payload_type: &str) -> Result<DecompressionResult> {
        // Only support generic transaction payloads
        let json_value = match payload_type {
            "transaction" => {
                // TODO: The following functions are commented out because the protobuf types are missing.
                // Uncomment and implement when the types are available.
                // let payload = TransactionPayload::decode(protobuf_data.as_slice())?;
                // self.transaction_payload_to_json(payload)?
                serde_json::Value::Null
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
                error: Some(format!("JSON parsing failed: {e}")),
            }),
        }
    }

    /// Decompress with fallback to different formats
    pub async fn decompress_with_fallback(&mut self, compressed_data: &[u8], payload_type: &str) -> Result<DecompressionResult> {
        // Try protobuf CBOR first
        match self.try_decompress_protobuf_cbor(compressed_data, payload_type) {
            Ok(result) if result.success => Ok(result),
            _ => {
                // Fallback to JSON
                self.try_json_fallback(compressed_data)
            }
        }
    }

    // TODO: The following functions are commented out because the protobuf types are missing.
    // Uncomment and implement when the types are available.
    // fn transaction_payload_to_json(&self, payload: TransactionPayload) -> Result<serde_json::Value> {
    //     let mut obj = serde_json::Map::new();
    //     
    //     obj.insert("to".to_string(), serde_json::Value::String(payload.to));
    //     obj.insert("amount".to_string(), serde_json::Value::String(payload.amount));
    //     obj.insert("chainId".to_string(), serde_json::Value::String(payload.chain_id));
    //     obj.insert("paymentReference".to_string(), serde_json::Value::String(payload.payment_reference));
    //     obj.insert("timestamp".to_string(), serde_json::Value::Number(payload.timestamp.into()));
    //     obj.insert("version".to_string(), serde_json::Value::String(payload.version));
    //     obj.insert("type".to_string(), serde_json::Value::String(payload.r#type));

    //     if let Some(token) = payload.token {
    //         obj.insert("token".to_string(), self.token_to_json(token)?);
    //     }

    //     if let Some(metadata) = payload.metadata {
    //         obj.insert("metadata".to_string(), self.payment_metadata_to_json(metadata)?);
    //     }

    //     Ok(serde_json::Value::Object(obj))
    // }

    // TODO: The following functions are commented out because the protobuf types are missing.
    // Uncomment and implement when the types are available.
    // fn token_to_json(&self, token: Token) -> Result<serde_json::Value> {
    //     let mut obj = serde_json::Map::new();
    //     
    //     obj.insert("symbol".to_string(), serde_json::Value::String(token.symbol));
    //     obj.insert("name".to_string(), serde_json::Value::String(token.name));
    //     obj.insert("decimals".to_string(), serde_json::Value::Number(token.decimals.into()));
    //     obj.insert("address".to_string(), serde_json::Value::String(token.address));
    //     obj.insert("chainId".to_string(), serde_json::Value::String(token.chain_id));
    //     obj.insert("isNative".to_string(), serde_json::Value::Bool(token.is_native));

    //     Ok(serde_json::Value::Object(obj))
    // }

    // TODO: The following functions are commented out because the protobuf types are missing.
    // Uncomment and implement when the types are available.
    // fn payment_metadata_to_json(&self, metadata: PaymentMetadata) -> Result<serde_json::Value> {
    //     let mut obj = serde_json::Map::new();
    //     
    //     obj.insert("merchant".to_string(), serde_json::Value::String(metadata.merchant));
    //     obj.insert("location".to_string(), serde_json::Value::String(metadata.location));
    //     obj.insert("maxAmount".to_string(), serde_json::Value::String(metadata.max_amount));
    //     obj.insert("minAmount".to_string(), serde_json::Value::String(metadata.min_amount));
    //     obj.insert("expiry".to_string(), serde_json::Value::Number(metadata.expiry.into()));
    //     obj.insert("timestamp".to_string(), serde_json::Value::Number(metadata.timestamp.into()));

    //     let mut extra_obj = serde_json::Map::new();
    //     for (key, value) in metadata.extra {
    //         extra_obj.insert(key, serde_json::Value::String(value));
    //     }
    //     obj.insert("extra".to_string(), serde_json::Value::Object(extra_obj));

    //     Ok(serde_json::Value::Object(obj))
    // }
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