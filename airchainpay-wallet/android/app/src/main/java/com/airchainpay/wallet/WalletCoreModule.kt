package com.airchainpay.wallet

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class WalletCoreModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "WalletCore"

    @ReactMethod
    fun init(promise: Promise) {
        try {
            val result = RustWalletCore.init()
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", e)
        }
    }

    @ReactMethod
    fun createWallet(name: String, network: Int, promise: Promise) {
        try {
            val result = RustWalletCore.createWallet(name, network)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("CREATE_WALLET_ERROR", e)
        }
    }

    @ReactMethod
    fun importWallet(seedPhrase: String, promise: Promise) {
        try {
            val result = RustWalletCore.importWallet(seedPhrase)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("IMPORT_WALLET_ERROR", e)
        }
    }

    @ReactMethod
    fun signMessage(walletId: String, message: String, promise: Promise) {
        try {
            val result = RustWalletCore.signMessage(walletId, message)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("SIGN_ERROR", e)
        }
    }

    @ReactMethod
    fun sendTransaction(walletId: String, toAddress: String, amount: String, network: Int, password: String, promise: Promise) {
        try {
            val result = RustWalletCore.sendTransaction(walletId, toAddress, amount, network, password)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("SEND_TX_ERROR", e)
        }
    }

    @ReactMethod
    fun getBalance(walletId: String, network: Int, password: String, promise: Promise) {
        try {
            val result = RustWalletCore.getBalance(walletId, network, password)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("GET_BALANCE_ERROR", e)
        }
    }

    @ReactMethod
    fun getSupportedNetworks(promise: Promise) {
        try {
            val result = RustWalletCore.getSupportedNetworks()
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("GET_NETWORKS_ERROR", e)
        }
    }

    @ReactMethod
    fun getTokenBalance(walletId: String, tokenAddress: String, network: Int, password: String, promise: Promise) {
        try {
            val result = RustWalletCore.getTokenBalance(walletId, tokenAddress, network, password)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("GET_TOKEN_BALANCE_ERROR", e)
        }
    }

    @ReactMethod
    fun backupWallet(walletId: String, password: String, promise: Promise) {
        try {
            val result = RustWalletCore.backupWallet(walletId, password)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("BACKUP_WALLET_ERROR", e)
        }
    }

    @ReactMethod
    fun restoreWallet(backupData: String, password: String, promise: Promise) {
        try {
            val result = RustWalletCore.restoreWallet(backupData, password)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("RESTORE_WALLET_ERROR", e)
        }
    }

    @ReactMethod
    fun bleSendPayment(promise: Promise) {
        try {
            val result = RustWalletCore.bleSendPayment()
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("BLE_SEND_PAYMENT_ERROR", e)
        }
    }
} 