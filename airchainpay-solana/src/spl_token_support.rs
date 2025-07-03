use crate::{
    error::AirChainPayError,
    state::{PaymentRecord, ProgramState, MAX_PAYMENT_REFERENCE_LEN},
};
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    msg,
    program::invoke,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
    rent::Rent,
    sysvar::Sysvar,
};
use solana_system_interface::instruction as system_instruction;
use spl_token::{
    instruction as token_instruction,
    state::{Account as TokenAccount, Mint},
};

/// SPL Token payment instruction data
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct TokenPaymentData {
    pub amount: u64,
    pub payment_reference: String,
}

/// Known token mint addresses on Solana Devnet
pub const USDC_MINT_DEVNET: &str = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"; // USDC on Devnet

/// Process SPL token payment
pub fn process_token_payment(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount: u64,
    payment_reference: String,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let payer_info = next_account_info(account_info_iter)?;
    let payer_token_account_info = next_account_info(account_info_iter)?;
    let recipient_token_account_info = next_account_info(account_info_iter)?;
    let mint_info = next_account_info(account_info_iter)?;
    let payment_record_info = next_account_info(account_info_iter)?;
    let program_state_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;
    let system_program_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;

    // Verify payer is signer
    if !payer_info.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify program state account
    if program_state_info.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    // Validate payment reference
    if payment_reference.len() > MAX_PAYMENT_REFERENCE_LEN {
        return Err(AirChainPayError::PaymentReferenceTooLong.into());
    }

    if payment_reference.is_empty() {
        return Err(AirChainPayError::InvalidPaymentReference.into());
    }

    // Validate amount
    if amount == 0 {
        return Err(AirChainPayError::ExpectedAmountMismatch.into());
    }

    // Load and validate program state
    let mut program_state = ProgramState::unpack(&program_state_info.data.borrow())?;
    if !program_state.is_initialized() {
        return Err(AirChainPayError::AccountNotInitialized.into());
    }

    // Verify token accounts
    let payer_token_account = TokenAccount::unpack(&payer_token_account_info.data.borrow())?;
    let recipient_token_account = TokenAccount::unpack(&recipient_token_account_info.data.borrow())?;

    // Verify both accounts use the same mint
    if payer_token_account.mint != recipient_token_account.mint {
        return Err(ProgramError::InvalidAccountData);
    }

    // Verify mint matches
    if payer_token_account.mint != *mint_info.key {
        return Err(ProgramError::InvalidAccountData);
    }

    // Verify payer owns the source token account
    if payer_token_account.owner != *payer_info.key {
        return Err(AirChainPayError::Unauthorized.into());
    }

    // Check sufficient balance
    if payer_token_account.amount < amount {
        return Err(AirChainPayError::InsufficientFunds.into());
    }

    // Get mint information for validation
    let _mint_account = Mint::unpack(&mint_info.data.borrow())?;
    
    // Validate minimum amount (1 token unit)
    if amount < 1 {
        return Err(AirChainPayError::ExpectedAmountMismatch.into());
    }

    let rent = &Rent::from_account_info(rent_info)?;
    let clock = Clock::get()?;

    // Create payment record account if it doesn't exist
    if payment_record_info.data_len() == 0 {
        let space = PaymentRecord::LEN;
        let lamports = rent.minimum_balance(space);

        let create_account_ix = system_instruction::create_account(
            payer_info.key,
            payment_record_info.key,
            lamports,
            space as u64,
            program_id,
        );

        invoke(
            &create_account_ix,
            &[
                payer_info.clone(),
                payment_record_info.clone(),
                system_program_info.clone(),
            ],
        )?;
    }

    // Create SPL token transfer instruction
    let transfer_instruction = token_instruction::transfer(
        token_program_info.key,
        payer_token_account_info.key,
        recipient_token_account_info.key,
        payer_info.key,
        &[],
        amount,
    )?;

    // Execute token transfer
    invoke(
        &transfer_instruction,
        &[
            payer_token_account_info.clone(),
            recipient_token_account_info.clone(),
            payer_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    // Create payment record
    let payment_record = PaymentRecord {
        is_initialized: true,
        from: *payer_info.key,
        to: recipient_token_account.owner,
        amount,
        payment_reference: payment_reference.clone(),
        timestamp: clock.unix_timestamp,
        signature: [0; 64], // Placeholder for transaction signature
    };

    PaymentRecord::pack(payment_record, &mut payment_record_info.data.borrow_mut())?;

    // Update program state statistics
    program_state.total_payments = program_state
        .total_payments
        .checked_add(1)
        .ok_or(AirChainPayError::AmountOverflow)?;

    program_state.total_volume = program_state
        .total_volume
        .checked_add(amount)
        .ok_or(AirChainPayError::AmountOverflow)?;

    ProgramState::pack(program_state, &mut program_state_info.data.borrow_mut())?;

    msg!(
        "SPL Token payment processed: {} tokens from {} to {} (mint: {}) with reference: {}",
        amount,
        payer_info.key,
        recipient_token_account.owner,
        mint_info.key,
        payment_reference
    );

    Ok(())
}

/// Create token account if it doesn't exist (simplified version)
pub fn create_token_account_if_needed<'a>(
    payer: &AccountInfo<'a>,
    token_account: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    owner: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
) -> ProgramResult {
    // Check if account already exists and is initialized
    if token_account.data_len() > 0 {
        let account_data = TokenAccount::unpack(&token_account.data.borrow())?;
        if account_data.mint == *mint.key && account_data.owner == *owner.key {
            return Ok(()); // Account already exists and is correct
        }
    }

    // Create token account manually
    let space = 165; // Size of SPL token account
    let rent = solana_program::rent::Rent::get()?;
    let lamports = rent.minimum_balance(space);

    let create_account_ix = system_instruction::create_account(
        payer.key,
        token_account.key,
        lamports,
        space as u64,
        &spl_token::id(),
    );

    invoke(
        &create_account_ix,
        &[
            payer.clone(),
            token_account.clone(),
            system_program.clone(),
        ],
    )?;

    // Initialize token account
    let init_account_ix = spl_token::instruction::initialize_account(
        &spl_token::id(),
        token_account.key,
        mint.key,
        owner.key,
    )?;

    invoke(
        &init_account_ix,
        &[
            token_account.clone(),
            mint.clone(),
            owner.clone(),
            token_program.clone(),
        ],
    )?;

    msg!("Created token account: {}", token_account.key);
    Ok(())
}

/// Validate if a mint is a supported stablecoin
pub fn is_supported_stablecoin(mint: &Pubkey) -> bool {
    let mint_str = mint.to_string();
    match mint_str.as_str() {
        USDC_MINT_DEVNET => true,
        // Add other supported tokens here
        _ => false,
    }
}

/// Get token info for supported tokens
pub fn get_token_info(mint: &Pubkey) -> Option<TokenInfo> {
    let mint_str = mint.to_string();
    match mint_str.as_str() {
        USDC_MINT_DEVNET => Some(TokenInfo {
            symbol: "USDC".to_string(),
            name: "USD Coin".to_string(),
            decimals: 6,
            is_stablecoin: true,
        }),
        _ => None,
    }
}

/// Token information structure
pub struct TokenInfo {
    pub symbol: String,
    pub name: String,
    pub decimals: u8,
    pub is_stablecoin: bool,
} 