use solana_program::program_error::ProgramError;
use thiserror::Error;

#[derive(Error, Debug, Copy, Clone)]
pub enum AirChainPayError {
    #[error("Invalid instruction")]
    InvalidInstruction,
    #[error("Not rent exempt")]
    NotRentExempt,
    #[error("Expected amount mismatch")]
    ExpectedAmountMismatch,
    #[error("Amount overflow")]
    AmountOverflow,
    #[error("Invalid payment reference")]
    InvalidPaymentReference,
    #[error("Unauthorized")]
    Unauthorized,
    #[error("Invalid recipient")]
    InvalidRecipient,
    #[error("Insufficient funds")]
    InsufficientFunds,
    #[error("Payment reference too long")]
    PaymentReferenceTooLong,
    #[error("Account already initialized")]
    AccountAlreadyInitialized,
    #[error("Account not initialized")]
    AccountNotInitialized,
}

impl From<AirChainPayError> for ProgramError {
    fn from(e: AirChainPayError) -> Self {
        ProgramError::Custom(e as u32)
    }
} 