use airchainpay_relay::utils::protobuf_compressor::ProtobufCompressor;
use serde_json::json;

#[tokio::main]
async fn main() {
    println!("🧪 Testing Protobuf/CBOR Compression System");
    println!("============================================\n");

    let mut compressor = ProtobufCompressor::new();

    // Test 1: Transaction payload compression
    println!("📦 Test 1: Transaction Payload Compression");
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

    match compressor.compress_transaction_payload(&transaction_data).await {
        Ok(compressed) => {
            println!("✅ Transaction compression successful");
            println!("   Original size: {} bytes", serde_json::to_string(&transaction_data).unwrap().len());
            println!("   Compressed size: {} bytes", compressed.len());
            println!("   Compression ratio: {:.2}%", 
                (compressed.len() as f64 / serde_json::to_string(&transaction_data).unwrap().len() as f64) * 100.0);
            
            // Test decompression
            match compressor.decompress_transaction_payload(&compressed).await {
                Ok(result) => {
                    if result.success {
                        println!("✅ Transaction decompression successful");
                        println!("   Format: {}", result.format);
                        assert_eq!(result.data, transaction_data);
                    } else {
                        println!("❌ Transaction decompression failed: {}", 
                            result.error.unwrap_or_default());
                    }
                }
                Err(e) => println!("❌ Transaction decompression error: {}", e),
            }
        }
        Err(e) => println!("❌ Transaction compression failed: {}", e),
    }

    println!();

    // Test 2: BLE payment data compression
    println!("📦 Test 2: BLE Payment Data Compression");
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

    match compressor.compress_ble_payment_data(&ble_data).await {
        Ok(compressed) => {
            println!("✅ BLE payment compression successful");
            println!("   Original size: {} bytes", serde_json::to_string(&ble_data).unwrap().len());
            println!("   Compressed size: {} bytes", compressed.len());
            println!("   Compression ratio: {:.2}%", 
                (compressed.len() as f64 / serde_json::to_string(&ble_data).unwrap().len() as f64) * 100.0);
            
            // Test decompression
            match compressor.decompress_ble_payment_data(&compressed).await {
                Ok(result) => {
                    if result.success {
                        println!("✅ BLE payment decompression successful");
                        println!("   Format: {}", result.format);
                        assert_eq!(result.data, ble_data);
                    } else {
                        println!("❌ BLE payment decompression failed: {}", 
                            result.error.unwrap_or_default());
                    }
                }
                Err(e) => println!("❌ BLE payment decompression error: {}", e),
            }
        }
        Err(e) => println!("❌ BLE payment compression failed: {}", e),
    }

    println!();

    // Test 3: QR payment request compression
    println!("📦 Test 3: QR Payment Request Compression");
    let qr_data = json!({
        "type": "payment",
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
                "key1": "value1"
            }
        },
        "timestamp": 1640995200,
        "version": "1.0.0"
    });

    match compressor.compress_qr_payment_request(&qr_data).await {
        Ok(compressed) => {
            println!("✅ QR payment compression successful");
            println!("   Original size: {} bytes", serde_json::to_string(&qr_data).unwrap().len());
            println!("   Compressed size: {} bytes", compressed.len());
            println!("   Compression ratio: {:.2}%", 
                (compressed.len() as f64 / serde_json::to_string(&qr_data).unwrap().len() as f64) * 100.0);
            
            // Test decompression
            match compressor.decompress_qr_payment_request(&compressed).await {
                Ok(result) => {
                    if result.success {
                        println!("✅ QR payment decompression successful");
                        println!("   Format: {}", result.format);
                        assert_eq!(result.data, qr_data);
                    } else {
                        println!("❌ QR payment decompression failed: {}", 
                            result.error.unwrap_or_default());
                    }
                }
                Err(e) => println!("❌ QR payment decompression error: {}", e),
            }
        }
        Err(e) => println!("❌ QR payment compression failed: {}", e),
    }

    println!();

    // Test 4: Auto-decompression with fallback
    println!("📦 Test 4: Auto-decompression with JSON Fallback");
    let json_data = json!({
        "test": "data",
        "number": 123,
        "nested": {
            "key": "value"
        }
    });

    let json_bytes = serde_json::to_vec(&json_data).unwrap();
    match compressor.auto_decompress(&json_bytes).await {
        Ok(decompressed) => {
            println!("✅ Auto-decompression successful");
            assert_eq!(decompressed, json_data);
        }
        Err(e) => println!("❌ Auto-decompression failed: {}", e),
    }

    println!();

    // Test 5: Compression statistics
    println!("📊 Test 5: Compression Statistics");
    let original_size = 1000;
    let compressed_size = 500;
    let stats = compressor.get_compression_stats(original_size, compressed_size);
    
    println!("   Original size: {} bytes", stats.original_size);
    println!("   Compressed size: {} bytes", stats.compressed_size);
    println!("   Compression ratio: {:.2}%", stats.compression_ratio * 100.0);
    println!("   Space saved: {:.2}%", stats.space_saved_percent);
    println!("   Format: {}", stats.format);

    println!("\n🎉 All tests completed!");
} 