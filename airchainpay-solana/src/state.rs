use borsh::{BorshDeserialize, BorshSerialize, to_vec as borsh_to_vec};
use solana_program::{
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
};

/// Maximum length for payment reference string
pub const MAX_PAYMENT_REFERENCE_LEN: usize = 32;

/// Program state account
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct ProgramState {
    /// Is initialized flag
    pub is_initialized: bool,
    /// Total number of payments processed
    pub total_payments: u64,
    /// Total volume processed (in lamports)
    pub total_volume: u64,
}

impl Sealed for ProgramState {}

impl IsInitialized for ProgramState {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl Pack for ProgramState {
    const LEN: usize = 1 + 8 + 8; // bool + u64 + u64

    fn unpack_from_slice(src: &[u8]) -> Result<Self, solana_program::program_error::ProgramError> {
        let mut data = src;
        Self::deserialize(&mut data).map_err(|_| solana_program::program_error::ProgramError::InvalidAccountData)
    }

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let data = borsh_to_vec(self).unwrap();
        dst[..data.len()].copy_from_slice(&data);
    }
}

/// Payment record account
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct PaymentRecord {
    /// Is initialized flag
    pub is_initialized: bool,
    /// Payment sender
    pub from: Pubkey,
    /// Payment recipient
    pub to: Pubkey,
    /// Payment amount in lamports
    pub amount: u64,
    /// Payment reference string
    pub payment_reference: String,
    /// Timestamp of payment
    pub timestamp: i64,
    /// Transaction signature (for reference)
    pub signature: [u8; 64],
}

impl Sealed for PaymentRecord {}

impl IsInitialized for PaymentRecord {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl Pack for PaymentRecord {
    const LEN: usize = 1 + 32 + 32 + 8 + 4 + MAX_PAYMENT_REFERENCE_LEN + 8 + 64; // Dynamic size for string

    fn unpack_from_slice(src: &[u8]) -> Result<Self, solana_program::program_error::ProgramError> {
        let mut data = src;
        Self::deserialize(&mut data).map_err(|_| solana_program::program_error::ProgramError::InvalidAccountData)
    }

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let data = borsh_to_vec(self).unwrap();
        if data.len() <= dst.len() {
            dst[..data.len()].copy_from_slice(&data);
        }
    }
}

/// Helper function to calculate payment record size based on reference length
pub fn get_payment_record_size(reference_len: usize) -> usize {
    1 + 32 + 32 + 8 + 4 + reference_len + 8 + 64
} 