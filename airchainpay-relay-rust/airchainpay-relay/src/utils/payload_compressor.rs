#![allow(dead_code, unused_variables)]
use anyhow::{Result, anyhow};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use crate::utils::protobuf_compressor::{ProtobufCompressor, DecompressionResult, CompressionStats};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressedPayload {
    pub data: Vec<u8>,
    pub compression_type: CompressionType,
    pub original_size: usize,
    pub compressed_size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CompressionType {
    None,
    Gzip,
    Deflate,
    LZ4,
    ProtobufCbor,
}

pub struct PayloadCompressor {
    compression_threshold: usize,
    max_compression_ratio: f64,
    protobuf_compressor: ProtobufCompressor,
}

impl PayloadCompressor {
    pub fn new() -> Self {
        Self {
            compression_threshold: 1024, // 1KB
            max_compression_ratio: 0.8, // 80% of original size
            protobuf_compressor: ProtobufCompressor::new(),
        }
    }

    pub fn compress(&self, data: &[u8]) -> Result<CompressedPayload> {
        if data.len() < self.compression_threshold {
            return Ok(CompressedPayload {
                data: data.to_vec(),
                compression_type: CompressionType::None,
                original_size: data.len(),
                compressed_size: data.len(),
            });
        }

        // Try different compression methods
        let mut best_result = CompressedPayload {
            data: data.to_vec(),
            compression_type: CompressionType::None,
            original_size: data.len(),
            compressed_size: data.len(),
        };

        // Try Gzip compression
        if let Ok(gzip_data) = self.compress_gzip(data) {
            let ratio = gzip_data.len() as f64 / data.len() as f64;
            if ratio < self.max_compression_ratio && gzip_data.len() < best_result.compressed_size {
                best_result = CompressedPayload {
                    data: gzip_data,
                    compression_type: CompressionType::Gzip,
                    original_size: data.len(),
                    compressed_size: best_result.compressed_size,
                };
                best_result.compressed_size = best_result.data.len();
            }
        }

        // Try Deflate compression
        if let Ok(deflate_data) = self.compress_deflate(data) {
            let ratio = deflate_data.len() as f64 / data.len() as f64;
            if ratio < self.max_compression_ratio && deflate_data.len() < best_result.compressed_size {
                best_result = CompressedPayload {
                    data: deflate_data,
                    compression_type: CompressionType::Deflate,
                    original_size: data.len(),
                    compressed_size: best_result.compressed_size,
                };
                best_result.compressed_size = best_result.data.len();
            }
        }

        // Try LZ4 compression
        if let Ok(lz4_data) = self.compress_lz4(data) {
            let ratio = lz4_data.len() as f64 / data.len() as f64;
            if ratio < self.max_compression_ratio && lz4_data.len() < best_result.compressed_size {
                best_result = CompressedPayload {
                    data: lz4_data,
                    compression_type: CompressionType::LZ4,
                    original_size: data.len(),
                    compressed_size: best_result.compressed_size,
                };
                best_result.compressed_size = best_result.data.len();
            }
        }

        Ok(best_result)
    }

    pub fn decompress(&self, payload: &CompressedPayload) -> Result<Vec<u8>> {
        match payload.compression_type {
            CompressionType::None => Ok(payload.data.clone()),
            CompressionType::Gzip => self.decompress_gzip(&payload.data),
            CompressionType::Deflate => self.decompress_deflate(&payload.data),
            CompressionType::LZ4 => self.decompress_lz4(&payload.data),
            CompressionType::ProtobufCbor => {
                // This would require async context, so we'll handle it separately
                Err(anyhow!("Protobuf/CBOR decompression requires async context"))
            }
        }
    }

    /// Decompress transaction payload using Protobuf and CBOR (async version)
    pub async fn decompress_transaction_payload(&mut self, compressed_data: &[u8]) -> Result<DecompressionResult> {
        self.protobuf_compressor.decompress_transaction_payload(compressed_data).await
    }

    /// Try to decompress data with fallback to JSON (async version)
    pub async fn decompress_with_fallback(&mut self, compressed_data: &[u8], payload_type: &str) -> Result<serde_json::Value> {
        let result = self.protobuf_compressor.decompress_with_fallback(compressed_data, payload_type).await?;
        Ok(result.data)
    }

    /// Auto-detect payload format and decompress accordingly (async version)
    pub async fn auto_decompress(&mut self, data: &[u8]) -> Result<serde_json::Value> {
        self.protobuf_compressor.auto_decompress(data).await
    }

    /// Compress transaction payload using Protobuf and CBOR (async version)
    pub async fn compress_transaction_payload(&mut self, transaction_data: &serde_json::Value) -> Result<Vec<u8>> {
        self.protobuf_compressor.compress_transaction_payload(transaction_data).await
    }

    fn compress_gzip(&self, data: &[u8]) -> Result<Vec<u8>> {
        use flate2::write::GzEncoder;
        use flate2::Compression;
        use std::io::Write;

        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(data)
            .map_err(|e| anyhow!("Gzip compression failed: {}", e))?;
        encoder.finish()
            .map_err(|e| anyhow!("Gzip compression finish failed: {}", e))
    }

    fn decompress_gzip(&self, data: &[u8]) -> Result<Vec<u8>> {
        use flate2::read::GzDecoder;
        use std::io::Read;

        let mut decoder = GzDecoder::new(data);
        let mut decompressed = Vec::new();
        decoder.read_to_end(&mut decompressed)
            .map_err(|e| anyhow!("Gzip decompression failed: {}", e))?;
        Ok(decompressed)
    }

    fn compress_deflate(&self, data: &[u8]) -> Result<Vec<u8>> {
        use flate2::write::DeflateEncoder;
        use flate2::Compression;
        use std::io::Write;

        let mut encoder = DeflateEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(data)
            .map_err(|e| anyhow!("Deflate compression failed: {}", e))?;
        encoder.finish()
            .map_err(|e| anyhow!("Deflate compression finish failed: {}", e))
    }

    fn decompress_deflate(&self, data: &[u8]) -> Result<Vec<u8>> {
        use flate2::read::DeflateDecoder;
        use std::io::Read;

        let mut decoder = DeflateDecoder::new(data);
        let mut decompressed = Vec::new();
        decoder.read_to_end(&mut decompressed)
            .map_err(|e| anyhow!("Deflate decompression failed: {}", e))?;
        Ok(decompressed)
    }

    fn compress_lz4(&self, data: &[u8]) -> Result<Vec<u8>> {
        use lz4::block::compress;
        
        compress(data, None, false)
            .map_err(|e| anyhow!("LZ4 compression failed: {}", e))
    }

    fn decompress_lz4(&self, data: &[u8]) -> Result<Vec<u8>> {
        use lz4::block::decompress;
        
        // For LZ4, we need to know the original size
        // This is a simplified implementation
        decompress(data, None)
            .map_err(|e| anyhow!("LZ4 decompression failed: {}", e))
    }

    pub fn compress_transaction_data(&self, transaction_data: &str) -> Result<CompressedPayload> {
        let data = transaction_data.as_bytes();
        self.compress(data)
    }

    pub fn compress_device_data(&self, device_data: &HashMap<String, String>) -> Result<CompressedPayload> {
        let json_data = serde_json::to_string(device_data)
            .map_err(|e| anyhow!("Failed to serialize device data: {}", e))?;
        self.compress(json_data.as_bytes())
    }

    pub fn compress_metrics_data(&self, metrics: &HashMap<String, u64>) -> Result<CompressedPayload> {
        let json_data = serde_json::to_string(metrics)
            .map_err(|e| anyhow!("Failed to serialize metrics: {}", e))?;
        self.compress(json_data.as_bytes())
    }

    pub fn get_compression_stats(&self, payload: &CompressedPayload) -> HashMap<String, f64> {
        let mut stats = HashMap::new();
        
        let compression_ratio = payload.compressed_size as f64 / payload.original_size as f64;
        let space_saved = 1.0 - compression_ratio;
        
        stats.insert("compression_ratio".to_string(), compression_ratio);
        stats.insert("space_saved_percent".to_string(), space_saved * 100.0);
        stats.insert("original_size_bytes".to_string(), payload.original_size as f64);
        stats.insert("compressed_size_bytes".to_string(), payload.compressed_size as f64);
        
        stats
    }

    pub fn is_compression_beneficial(&self, payload: &CompressedPayload) -> bool {
        payload.compressed_size < payload.original_size &&
        (payload.compressed_size as f64 / payload.original_size as f64) < self.max_compression_ratio
    }

    pub fn set_compression_threshold(&mut self, threshold: usize) {
        self.compression_threshold = threshold;
    }

    pub fn set_max_compression_ratio(&mut self, ratio: f64) {
        self.max_compression_ratio = ratio;
    }

    /// Get compression statistics for protobuf/cbor compression
    pub fn get_protobuf_compression_stats(&self, original_size: usize, compressed_size: usize) -> CompressionStats {
        self.protobuf_compressor.get_compression_stats(original_size, compressed_size)
    }
}

impl Default for PayloadCompressor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_compression_decompression() {
        let compressor = PayloadCompressor::new();
        let test_data = "This is a test string that should be compressed. ".repeat(100);
        let data_bytes = test_data.as_bytes();

        let compressed = compressor.compress(data_bytes).unwrap();
        let decompressed = compressor.decompress(&compressed).unwrap();

        assert_eq!(data_bytes, decompressed.as_slice());
    }

    #[test]
    fn test_small_data_no_compression() {
        let compressor = PayloadCompressor::new();
        let small_data = "small".as_bytes();

        let compressed = compressor.compress(small_data).unwrap();
        assert!(matches!(compressed.compression_type, CompressionType::None));
    }

    #[test]
    fn test_compression_stats() {
        let compressor = PayloadCompressor::new();
        let test_data = "This is a test string that should be compressed. ".repeat(100);
        let data_bytes = test_data.as_bytes();

        let compressed = compressor.compress(data_bytes).unwrap();
        let stats = compressor.get_compression_stats(&compressed);

        assert!(stats.contains_key("compression_ratio"));
        assert!(stats.contains_key("space_saved_percent"));
        assert!(stats.contains_key("original_size_bytes"));
        assert!(stats.contains_key("compressed_size_bytes"));
    }

    #[tokio::test]
    async fn test_protobuf_compression() {
        let mut compressor = PayloadCompressor::new();
        
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
} 