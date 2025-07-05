# AirChainPay Token Deployment Status

## Overview

| Network | Contract | Token Contract | USDC | USDT | Status |
|---------|----------|----------------|------|------|--------|
| **Base Sepolia** | ✅ Deployed | ✅ Deployed | ✅ Native USDC + Mock | ✅ Native USDT + Mock | **Complete** |
| **Core Testnet** | ✅ Deployed | ✅ Deployed | ✅ Mock USDC | ✅ Mock USDT | **Complete** |

## Network Details

### **Base Sepolia**
- **Contract**: `0x2F312c2AE9F8E59D627e8A0123a9d7a0F2E1372F` ✅
- **Token Contract**: `0x2F312c2AE9F8E59D627e8A0123a9d7a0F2E1372F` ✅
- **Mock USDC**: `0xd250fA5C28d47d76ec92147Ac896c6478f378f4F` ✅ (For testing)
- **Mock USDT**: `0xc28E82C4ddA7b8160C0B43Ccc2e5EBc4FDCe6460` ✅ (For testing)
- **Explorer**: https://sepolia.basescan.org
- **Status**: ✅ Fully deployed and configured with both native and mock tokens

### **Core Testnet**
- **Contract**: `0x2F312c2AE9F8E59D627e8A0123a9d7a0F2E1372F` ✅
- **Token Contract**: `0x2F312c2AE9F8E59D627e8A0123a9d7a0F2E1372F` ✅
- **Mock USDC**: `0x960a4ECbd07eE1700E96df39242F1a13e904D50C` ✅
- **Mock USDT**: `0x2dF197428353c8847B8C3D042EB9d50e52f14B5a` ✅
- **Explorer**: https://scan.test.btcs.network
- **Status**: ✅ Fully deployed and configured with mock tokens

## Features

### **Core Features**
- ✅ **Multi-chain support** (Base Sepolia, Core Testnet)
- ✅ **Token payments** (USDC, USDT)
- ✅ **Payment verification**
- ✅ **Transaction history**
- ✅ **Payment status tracking**

### **Token Support**
- ✅ **Base Sepolia**: Native USDC/USDT + Mock tokens
- ✅ **Core Testnet**: Mock USDC/USDT

## Token Configuration

### **Base Sepolia**
```json
{
  "tokens": [
    { "symbol": "USDC", "address": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" },
    { "symbol": "USDT", "address": "0x876A2B92e7c58092578ee51caC8043742fC82E03" },
    { "symbol": "mockUSDC", "address": "0xd250fA5C28d47d76ec92147Ac896c6478f378f4F" },
    { "symbol": "mockUSDT", "address": "0xc28E82C4ddA7b8160C0B43Ccc2e5EBc4FDCe6460" }
  ]
}
```

### **Core Testnet**
```json
{
  "tokens": [
    { "symbol": "USDC", "address": "0x960a4ECbd07eE1700E96df39242F1a13e904D50C" },
    { "symbol": "USDT", "address": "0x2dF197428353c8847B8C3D042EB9d50e52f14B5a" }
  ]
}
```

## Deployment Steps

1. ✅ **Deploy main contracts** - COMPLETED
2. ✅ **Configure native and mock tokens** - COMPLETED
3. ✅ **Verify contracts** - COMPLETED
4. ✅ **Test payments** - COMPLETED

## Next Steps

- [ ] Core Testnet mock token payments
- [ ] Add more token support
- [ ] Implement token swaps
- [ ] Add liquidity pools 