fn main() {
    // Generate Rust code from protobuf files
    prost_build::compile_protos(
        &["src/proto/transaction.proto"],
        &["src/proto"],
    )
    .unwrap();
} 