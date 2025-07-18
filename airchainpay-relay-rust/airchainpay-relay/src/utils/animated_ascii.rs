use std::time::Duration;
use std::thread;
use colored::*;
use std::io::{self, Write};
use std::env;

#[derive(Debug)]
pub enum AnimationStyle {
    Full,
    Simple,
    Static,
    Matrix,
}

pub struct AnimatedAscii {
    frames: Vec<String>,
    colors: Vec<&'static str>,
    current_frame: usize,
    current_color: usize,
}

impl AnimatedAscii {
    pub fn new() -> Self {
        let logo = vec![
            " █████╗ ██╗██████╗  ██████╗██╗  ██╗ █████╗ ██╗███╗   ██╗██████╗  █████╗ ██╗   ██╗".to_string(),
            "██╔══██╗██║██╔══██╗██╔════╝██║  ██║██╔══██╗██║████╗  ██║██╔══██╗██╔══██╗╚██╗ ██╔╝".to_string(),
            "███████║██║██████╔╝██║     ███████║███████║██║██╔██╗ ██║██████╔╝███████║ ╚████╔╝ ".to_string(),
            "██╔══██║██║██╔══██╗██║     ██╔══██║██╔══██║██║██║╚██╗██║██╔═══╝ ██╔══██║  ╚██╔╝  ".to_string(),
            "██║  ██║██║██║  ██║╚██████╗██║  ██║██║  ██║██║██║ ╚████║██║     ██║  ██║   ██║   ".to_string(),
            "╚═╝  ╚═╝╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚═╝     ╚═╝  ╚═╝   ╚═╝   ".to_string(),
        ];

        let colors = vec!["blue", "cyan", "magenta", "green", "yellow", "red"];

        Self {
            frames: logo,
            colors,
            current_frame: 0,
            current_color: 0,
        }
    }

    pub fn display_typing_animation(&mut self, speed_ms: u64) {
        println!("\n");
        
        for (_line_index, line) in self.frames.iter().enumerate() {
            let mut animated_line = String::new();
            let chars: Vec<char> = line.chars().collect();
            
            for (char_index, &ch) in chars.iter().enumerate() {
                animated_line.push(ch);
                
                // Clear line and reprint
                print!("\r");
                io::stdout().flush().unwrap();
                
                // Apply color based on position and animation
                let color_index = (self.current_color + char_index) % self.colors.len();
                let colored_line = self.apply_color(&animated_line, color_index);
                print!("{}", colored_line);
                
                // Add remaining characters in dim color
                if char_index < chars.len() - 1 {
                    let remaining: String = chars[char_index + 1..].iter().collect();
                    print!("{}", remaining.dimmed());
                }
                
                thread::sleep(Duration::from_millis(speed_ms));
            }
            println!(); // Move to next line
        }
        
        self.current_color = (self.current_color + 1) % self.colors.len();
    }

    pub fn display_color_cycle(&self, _cycles: usize, speed_ms: u64) {
        // Only show one cycle to avoid repetition
        for (line_index, line) in self.frames.iter().enumerate() {
            let color_index = (self.current_color + line_index) % self.colors.len();
            let colored_line = self.apply_color(line, color_index);
            println!("{}", colored_line);
        }
        thread::sleep(Duration::from_millis(speed_ms));
    }

    pub fn display_glow_effect(&self, intensity: f32) {
        println!("\n");
        
        for line in &self.frames {
            let glow_line = self.add_glow_effect(line, intensity);
            println!("{}", glow_line);
        }
    }

    pub fn display_pulse_animation(&mut self, _duration_secs: u64) {
        // Show only one pulse effect instead of continuous loop
        let intensity = 0.5; // Medium intensity
        
        for line in &self.frames {
            let glow_line = self.add_glow_effect(line, intensity);
            println!("{}", glow_line);
        }
        
        thread::sleep(Duration::from_millis(1000)); // Brief pause
    }

    pub fn display_matrix_effect(&mut self, _duration_secs: u64) {
        // Show only one matrix frame instead of continuous loop
        for (line_index, line) in self.frames.iter().enumerate() {
            let matrix_line = self.apply_matrix_effect(line, line_index);
            println!("{}", matrix_line);
        }
        
        thread::sleep(Duration::from_millis(1000)); // Brief pause
    }

    fn apply_color(&self, text: &str, color_index: usize) -> String {
        match self.colors[color_index] {
            "blue" => text.blue().to_string(),
            "cyan" => text.cyan().to_string(),
            "magenta" => text.magenta().to_string(),
            "green" => text.green().to_string(),
            "yellow" => text.yellow().to_string(),
            "red" => text.red().to_string(),
            _ => text.to_string(),
        }
    }

    fn add_glow_effect(&self, text: &str, intensity: f32) -> String {
        let glow_chars = vec!["░", "▒", "▓", "█"];
        let glow_index = (intensity * (glow_chars.len() - 1) as f32) as usize;
        let glow_char = glow_chars[glow_index.min(glow_chars.len() - 1)];
        
        format!("{}{}{}", glow_char, text.blue(), glow_char)
    }

    fn apply_matrix_effect(&self, text: &str, line_index: usize) -> String {
        let matrix_chars = vec!["░", "▒", "▓", "█"];
        let char_index = (self.current_frame + line_index) % matrix_chars.len();
        let matrix_char = matrix_chars[char_index];
        
        format!("{}{}{}", matrix_char, text.green(), matrix_char)
    }

    pub fn display_final_animation(&mut self) {
        // Initial typing animation
        self.display_typing_animation(50);
        
        // Brief pause
        thread::sleep(Duration::from_millis(500));
        
        // Single color cycle (no repetition)
        self.display_color_cycle(1, 200);
        
        // Brief pause
        thread::sleep(Duration::from_millis(500));
        
        // Single pulse effect (no repetition)
        self.display_pulse_animation(1);
        
        // Final static display
        println!("\n");
        for line in &self.frames {
            println!("{}", line.blue());
        }
        
        // Tagline
        println!("\n{}", "Powering the Future of Payments. Fast. Secure. Borderless.".blue());
    }

    pub fn display_simple_animation(&mut self) {
        // Quick typing effect
        self.display_typing_animation(30);
        
        // Brief pause
        thread::sleep(Duration::from_millis(300));
        
        // Single color cycle (no repetition)
        self.display_color_cycle(1, 150);
        
        // Final static display
        println!("\n");
        for line in &self.frames {
            println!("{}", line.blue());
        }
        
        println!("\n{}", "Powering the Future of Payments. Fast. Secure. Borderless.".blue());
    }

    pub fn display_static(&self) {
        println!("\n");
        for line in &self.frames {
            println!("{}", line.blue());
        }
        println!("\n{}", "Powering the Future of Payments. Fast. Secure. Borderless.".blue());
    }
}

pub fn get_animation_style() -> AnimationStyle {
    match env::var("ANIMATION_STYLE").unwrap_or_else(|_| "full".to_string()).as_str() {
        "simple" => AnimationStyle::Simple,
        "static" => AnimationStyle::Static,
        "matrix" => AnimationStyle::Matrix,
        _ => AnimationStyle::Full,
    }
}

pub fn display_animated_logo() {
    let style = get_animation_style();
    let mut animator = AnimatedAscii::new();
    
    match style {
        AnimationStyle::Full => animator.display_final_animation(),
        AnimationStyle::Simple => animator.display_simple_animation(),
        AnimationStyle::Static => animator.display_static(),
        AnimationStyle::Matrix => {
            // Show matrix effect only once
            animator.display_matrix_effect(1);
            animator.display_static();
        }
    }
}

pub fn display_simple_animation() {
    let mut animator = AnimatedAscii::new();
    animator.display_simple_animation();
} 