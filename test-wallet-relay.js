// Test script to verify the wallet's relay transport logic
const { PaymentService } = require('./airchainpay-wallet/src/services/PaymentService');

async function testWalletRelayFlow() {
  console.log('Testing wallet relay transport flow...');
  
  try {
    const paymentService = PaymentService.getInstance();
    
    // Test payment request
    const paymentRequest = {
      to: '0xb490ea033524c85c2740e6ddf6a30c75bbff1a8f',
      amount: '1',
      chainId: 'base_sepolia',
      transport: 'relay',
      token: {
        symbol: 'USDT',
        name: 'Tether USD',
        address: '0x3c6E5e4F0b3B56a5324E5e6D2a009b34Eb63885d',
        decimals: 6,
        isStablecoin: true,
        isNative: false
      }
    };
    
    console.log('Sending payment request:', paymentRequest);
    
    const result = await paymentService.sendPayment(paymentRequest);
    
    console.log('Payment result:', result);
    
    if (result.status === 'queued') {
      console.log('✅ Transaction queued successfully (offline mode)');
    } else if (result.status === 'sent') {
      console.log('✅ Transaction sent successfully via relay');
    } else {
      console.log('❌ Payment failed:', result.message);
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

testWalletRelayFlow(); 