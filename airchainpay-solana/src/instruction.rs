use borsh::{BorshDeserialize, BorshSerialize, to_vec as borsh_to_vec};
use solana_program::{
    instruction::{AccountMeta, Instruction},
    program_error::ProgramError,
    pubkey::Pubkey,
};
use solana_sdk_ids::system_program;

/// Instructions supported by the AirChainPay program
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum AirChainPayInstruction {
    /// Initialize the program state
    /// 
    /// Accounts expected:
    /// 0. `[signer, writable]` Authority account (program owner)
    /// 1. `[writable]` Program state account
    /// 2. `[]` System program
    /// 3. `[]` Rent sysvar
    InitializeProgram,

    /// Process a payment
    /// 
    /// Accounts expected:
    /// 0. `[signer, writable]` Payer account (sender)
    /// 1. `[writable]` Recipient account
    /// 2. `[writable]` Payment record account
    /// 3. `[writable]` Program state account
    /// 4. `[]` System program
    /// 5. `[]` Rent sysvar
    ProcessPayment {
        /// Amount to pay in lamports
        amount: u64,
        /// Payment reference string
        payment_reference: String,
    },

    /// Process an SPL token payment
    /// 
    /// Accounts expected:
    /// 0. `[signer]` Payer account (sender)
    /// 1. `[writable]` Payer's token account
    /// 2. `[writable]` Recipient's token account
    /// 3. `[]` Token mint account
    /// 4. `[writable]` Payment record account
    /// 5. `[writable]` Program state account
    /// 6. `[]` SPL Token program
    /// 7. `[]` System program
    /// 8. `[]` Rent sysvar
    ProcessTokenPayment {
        /// Amount to pay in token units
        amount: u64,
        /// Payment reference string
        payment_reference: String,
    },

    /// Withdraw funds (authority only)
    /// 
    /// Accounts expected:
    /// 0. `[signer, writable]` Authority account
    /// 1. `[writable]` Program state account
    /// 2. `[writable]` Destination account
    /// 3. `[]` System program
    WithdrawFunds {
        /// Amount to withdraw in lamports
        amount: u64,
    },
}

impl AirChainPayInstruction {
    /// Unpack instruction data
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let mut data = input;
        Self::deserialize(&mut data).map_err(|_| ProgramError::InvalidInstructionData)
    }
}

/// Create an initialize program instruction
pub fn initialize_program(
    program_id: &Pubkey,
    authority: &Pubkey,
    program_state: &Pubkey,
) -> Result<Instruction, ProgramError> {
    let accounts = vec![
        AccountMeta::new(*authority, true),
        AccountMeta::new(*program_state, false),
        AccountMeta::new_readonly(system_program::id(), false),
        AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false),
    ];

    let instruction_data = AirChainPayInstruction::InitializeProgram;

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data: borsh_to_vec(&instruction_data).unwrap(),
    })
}

/// Create a process payment instruction
pub fn process_payment(
    program_id: &Pubkey,
    payer: &Pubkey,
    recipient: &Pubkey,
    payment_record: &Pubkey,
    program_state: &Pubkey,
    amount: u64,
    payment_reference: String,
) -> Result<Instruction, ProgramError> {
    let accounts = vec![
        AccountMeta::new(*payer, true),
        AccountMeta::new(*recipient, false),
        AccountMeta::new(*payment_record, false),
        AccountMeta::new(*program_state, false),
        AccountMeta::new_readonly(system_program::id(), false),
        AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false),
    ];

    let instruction_data = AirChainPayInstruction::ProcessPayment {
        amount,
        payment_reference,
    };

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data: borsh_to_vec(&instruction_data).unwrap(),
    })
}

/// Create a process token payment instruction
pub fn process_token_payment(
    program_id: &Pubkey,
    payer: &Pubkey,
    payer_token_account: &Pubkey,
    recipient_token_account: &Pubkey,
    mint: &Pubkey,
    payment_record: &Pubkey,
    program_state: &Pubkey,
    amount: u64,
    payment_reference: String,
) -> Result<Instruction, ProgramError> {
    let accounts = vec![
        AccountMeta::new(*payer, true),
        AccountMeta::new(*payer_token_account, false),
        AccountMeta::new(*recipient_token_account, false),
        AccountMeta::new_readonly(*mint, false),
        AccountMeta::new(*payment_record, false),
        AccountMeta::new(*program_state, false),
        AccountMeta::new_readonly(solana_program::pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), false), // SPL Token program ID
        AccountMeta::new_readonly(system_program::id(), false),
        AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false),
    ];

    let instruction_data = AirChainPayInstruction::ProcessTokenPayment {
        amount,
        payment_reference,
    };

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data: borsh_to_vec(&instruction_data).unwrap(),
    })
}

/// Create a withdraw funds instruction
pub fn withdraw_funds(
    program_id: &Pubkey,
    authority: &Pubkey,
    program_state: &Pubkey,
    destination: &Pubkey,
    amount: u64,
) -> Result<Instruction, ProgramError> {
    let accounts = vec![
        AccountMeta::new(*authority, true),
        AccountMeta::new(*program_state, false),
        AccountMeta::new(*destination, false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];

    let instruction_data = AirChainPayInstruction::WithdrawFunds { amount };

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data: borsh_to_vec(&instruction_data).unwrap(),
    })
} 