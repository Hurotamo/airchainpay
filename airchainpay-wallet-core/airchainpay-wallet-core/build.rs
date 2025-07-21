fn main() {
    // Generate version information
    // Note: vergen is not available, so we'll use a simpler approach
    println!("cargo:rerun-if-changed=build.rs");

    // Platform-specific configurations
    println!("cargo:rerun-if-changed=build.rs");
    
    // Set feature flags based on target
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap();
    let target_arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap();
    
    println!("cargo:rustc-cfg=target_os=\"{}\"", target_os);
    println!("cargo:rustc-cfg=target_arch=\"{}\"", target_arch);
    
    // Set platform-specific features
    match target_os.as_str() {
        "ios" => {
            println!("cargo:rustc-cfg=platform_ios");
            println!("cargo:rustc-cfg=has_secure_enclave");
            println!("cargo:rustc-cfg=has_keychain");
            println!("cargo:rustc-cfg=has_biometric_auth");
        }
        "android" => {
            println!("cargo:rustc-cfg=platform_android");
            println!("cargo:rustc-cfg=has_keystore");
            println!("cargo:rustc-cfg=has_biometric_auth");
        }
        "macos" => {
            println!("cargo:rustc-cfg=platform_macos");
            println!("cargo:rustc-cfg=has_secure_enclave");
            println!("cargo:rustc-cfg=has_keychain");
            println!("cargo:rustc-cfg=has_biometric_auth");
        }
        "linux" => {
            println!("cargo:rustc-cfg=platform_linux");
        }
        "windows" => {
            println!("cargo:rustc-cfg=platform_windows");
        }
        _ => {
            println!("cargo:rustc-cfg=platform_unknown");
        }
    }
    
    // Set architecture-specific features
    match target_arch.as_str() {
        "x86_64" => {
            println!("cargo:rustc-cfg=arch_x86_64");
        }
        "aarch64" => {
            println!("cargo:rustc-cfg=arch_aarch64");
        }
        "arm" => {
            println!("cargo:rustc-cfg=arch_arm");
        }
        _ => {
            println!("cargo:rustc-cfg=arch_unknown");
        }
    }
} 