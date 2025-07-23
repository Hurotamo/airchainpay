package com.airchainpay.wallet

object RustWalletCore {
    init {
        System.loadLibrary("airchainpay_wallet_core")
    }

    @JvmStatic private external fun wallet_core_init(): Int
    @JvmStatic private external fun wallet_core_create_wallet(name: String, network: Int): String
    @JvmStatic private external fun wallet_core_import_wallet(seedPhrase: String): String
    @JvmStatic private external fun wallet_core_sign_message(walletId: String, message: String): String
    @JvmStatic private external fun wallet_core_send_transaction(walletId: String, toAddress: String, amount: String, network: Int, password: String): String
    @JvmStatic private external fun wallet_core_get_balance(walletId: String, network: Int, password: String): String
    @JvmStatic private external fun wallet_core_get_supported_networks(): String
    @JvmStatic private external fun wallet_core_get_token_balance(walletId: String, tokenAddress: String, network: Int, password: String): String
    @JvmStatic private external fun wallet_core_backup_wallet(walletId: String, password: String): String
    @JvmStatic private external fun wallet_core_restore_wallet(backupData: String, password: String): String
    @JvmStatic private external fun wallet_core_ble_send_payment(): Int
    // BLE receive payment uses a buffer, not directly mappable to JS, so we skip for now

    fun init(): Int = wallet_core_init()
    fun createWallet(name: String, network: Int): String = wallet_core_create_wallet(name, network)
    fun importWallet(seedPhrase: String): String = wallet_core_import_wallet(seedPhrase)
    fun signMessage(walletId: String, message: String): String = wallet_core_sign_message(walletId, message)
    fun sendTransaction(walletId: String, toAddress: String, amount: String, network: Int, password: String): String = wallet_core_send_transaction(walletId, toAddress, amount, network, password)
    fun getBalance(walletId: String, network: Int, password: String): String = wallet_core_get_balance(walletId, network, password)
    fun getSupportedNetworks(): String = wallet_core_get_supported_networks()
    fun getTokenBalance(walletId: String, tokenAddress: String, network: Int, password: String): String = wallet_core_get_token_balance(walletId, tokenAddress, network, password)
    fun backupWallet(walletId: String, password: String): String = wallet_core_backup_wallet(walletId, password)
    fun restoreWallet(backupData: String, password: String): String = wallet_core_restore_wallet(backupData, password)
    fun bleSendPayment(): Int = wallet_core_ble_send_payment()
} 