use airchainpay_relay::utils::animated_ascii::{self, AnimationStyle};

fn main() {
    println!("AirChainPay Logo Animation Demo");
    println!("================================");
    
    // Get animation style from command line args or environment
    let style = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "full".to_string());
    
    let animation_style = match style.as_str() {
        "simple" => AnimationStyle::Simple,
        "static" => AnimationStyle::Static,
        "matrix" => AnimationStyle::Matrix,
        _ => AnimationStyle::Full,
    };
    
    println!("Using animation style: {:?}", animation_style);
    println!("Press Ctrl+C to stop...\n");
    
    // Set the environment variable for the animation style
    std::env::set_var("ANIMATION_STYLE", style);
    
    // Display the animated logo
    animated_ascii::display_animated_logo();
    
    println!("\nAnimation completed!");
} 