use crate::{
    error::AirChainPayError,
    instruction::AirChainPayInstruction,
    state::{PaymentRecord, ProgramState, MAX_PAYMENT_REFERENCE_LEN, get_payment_record_size},
    // spl_token_support, // Commented out to avoid global allocator conflicts
};

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

pub struct Processor;

impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = AirChainPayInstruction::unpack(instruction_data)?;

        match instruction {
            AirChainPayInstruction::InitializeProgram => {
                msg!("Instruction: InitializeProgram");
                Self::process_initialize_program(accounts, program_id)
            }
            AirChainPayInstruction::ProcessPayment {
                amount,
                payment_reference,
            } => {
                msg!("Instruction: ProcessPayment");
                Self::process_payment(accounts, program_id, amount, payment_reference)
            }
            AirChainPayInstruction::ProcessTokenPayment {
                amount: _,
                payment_reference: _,
            } => {
                msg!("Instruction: ProcessTokenPayment - Not implemented yet");
                Err(ProgramError::InvalidInstructionData)
            }
            AirChainPayInstruction::WithdrawFunds { amount } => {
                msg!("Instruction: WithdrawFunds");
                Self::process_withdraw_funds(accounts, program_id, amount)
            }
        }
    }

    fn process_initialize_program(
        accounts: &[AccountInfo],
        program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let program_state_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        let rent_info = next_account_info(account_info_iter)?;

        // Verify authority is signer
        if !authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Verify program state account is owned by this program
        if program_state_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Check if already initialized
        if program_state_info.data_len() > 0 {
            let program_state = ProgramState::unpack_unchecked(&program_state_info.data.borrow())?;
            if program_state.is_initialized() {
                return Err(AirChainPayError::AccountAlreadyInitialized.into());
            }
        }

        let rent = &Rent::from_account_info(rent_info)?;

        // Create program state account if it doesn't exist
        if program_state_info.data_len() == 0 {
            let space = ProgramState::LEN;
            let lamports = rent.minimum_balance(space);

            let create_account_ix = system_instruction::create_account(
                authority_info.key,
                program_state_info.key,
                lamports,
                space as u64,
                program_id,
            );

            invoke(
                &create_account_ix,
                &[
                    authority_info.clone(),
                    program_state_info.clone(),
                    system_program_info.clone(),
                ],
            )?;
        }

        // Initialize program state
        let program_state = ProgramState {
            is_initialized: true,
            authority: *authority_info.key,
            total_payments: 0,
            total_volume: 0,
        };

        ProgramState::pack(program_state, &mut program_state_info.data.borrow_mut())?;

        msg!("AirChainPay program initialized with authority: {}", authority_info.key);

        Ok(())
    }

    fn process_payment(
        accounts: &[AccountInfo],
        program_id: &Pubkey,
        amount: u64,
        payment_reference: String,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let payer_info = next_account_info(account_info_iter)?;
        let recipient_info = next_account_info(account_info_iter)?;
        let payment_record_info = next_account_info(account_info_iter)?;
        let program_state_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        let rent_info = next_account_info(account_info_iter)?;

        // Verify payer is signer
        if !payer_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Verify accounts are owned correctly
        if program_state_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Validate payment reference length
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

        // Check payer has sufficient funds
        if payer_info.lamports() < amount {
            return Err(AirChainPayError::InsufficientFunds.into());
        }

        // Load and validate program state
        let mut program_state = ProgramState::unpack(&program_state_info.data.borrow())?;
        if !program_state.is_initialized() {
            return Err(AirChainPayError::AccountNotInitialized.into());
        }

        let rent = &Rent::from_account_info(rent_info)?;
        let clock = Clock::get()?;

        // Create payment record account if it doesn't exist
        if payment_record_info.data_len() == 0 {
            let space = get_payment_record_size(payment_reference.len());
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

        // Transfer lamports from payer to recipient
        **payer_info.try_borrow_mut_lamports()? = payer_info
            .lamports()
            .checked_sub(amount)
            .ok_or(AirChainPayError::InsufficientFunds)?;

        **recipient_info.try_borrow_mut_lamports()? = recipient_info
            .lamports()
            .checked_add(amount)
            .ok_or(AirChainPayError::AmountOverflow)?;

        // Create payment record
        let payment_record = PaymentRecord {
            is_initialized: true,
            from: *payer_info.key,
            to: *recipient_info.key,
            amount,
            payment_reference: payment_reference.clone(),
            timestamp: clock.unix_timestamp,
            signature: [0; 64], // Placeholder for now
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
            "Payment processed: {} lamports from {} to {} with reference: {}",
            amount,
            payer_info.key,
            recipient_info.key,
            payment_reference
        );

        Ok(())
    }

    fn process_withdraw_funds(
        accounts: &[AccountInfo],
        program_id: &Pubkey,
        amount: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let program_state_info = next_account_info(account_info_iter)?;
        let destination_info = next_account_info(account_info_iter)?;
        let _system_program_info = next_account_info(account_info_iter)?;

        // Verify authority is signer
        if !authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Verify program state account
        if program_state_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Load and validate program state
        let program_state = ProgramState::unpack(&program_state_info.data.borrow())?;
        if !program_state.is_initialized() {
            return Err(AirChainPayError::AccountNotInitialized.into());
        }

        // Verify authority
        if program_state.authority != *authority_info.key {
            return Err(AirChainPayError::Unauthorized.into());
        }

        // Validate amount
        if amount == 0 {
            return Err(AirChainPayError::ExpectedAmountMismatch.into());
        }

        // Check program state account has sufficient funds
        if program_state_info.lamports() < amount {
            return Err(AirChainPayError::InsufficientFunds.into());
        }

        // Transfer lamports from program state to destination
        **program_state_info.try_borrow_mut_lamports()? = program_state_info
            .lamports()
            .checked_sub(amount)
            .ok_or(AirChainPayError::InsufficientFunds)?;

        **destination_info.try_borrow_mut_lamports()? = destination_info
            .lamports()
            .checked_add(amount)
            .ok_or(AirChainPayError::AmountOverflow)?;

        msg!(
            "Funds withdrawn: {} lamports from program to {}",
            amount,
            destination_info.key
        );

        Ok(())
    }
} 