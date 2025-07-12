fn main() {
    // Generate Rust code from protobuf files
    tonic_build::configure()
        .build_server(false)
        .build_client(false)
        .compile(
            &["src/proto/transaction.proto"],
            &["src/proto"],
        )
        .unwrap();
} 