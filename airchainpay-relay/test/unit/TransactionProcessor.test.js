const { expect } = require('chai');
const sinon = require('sinon');
const { ethers } = require('ethers');
const { processTransaction, validateTransactionBeforeBroadcast, getTransactionStatus } = require('../../src/processors/TransactionProcessor');

describe('TransactionProcessor Unit Tests', () => {
  let sandbox;
  let mockProvider;
  let mockContract;
  let mockTxResponse;
  let mockReceipt;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Mock transaction response
    mockTxResponse = {
      hash: '0x123456789abcdef',
      wait: sandbox.stub().resolves({
        blockNumber: 12345,
        gasUsed: '21000',
        status: 1
      })
    };

    // Mock provider
    mockProvider = {
      broadcastTransaction: sandbox.stub().resolves(mockTxResponse),
      getTransactionReceipt: sandbox.stub(),
      getTransactionCount: sandbox.stub(),
      getFeeData: sandbox.stub()
    };

    // Mock contract
    mockContract = {
      // Add contract methods as needed
    };

    // Stub the blockchain utilities
    sandbox.stub(require('../../src/utils/blockchain'), 'getProvider').returns(mockProvider);
    sandbox.stub(require('../../src/utils/blockchain'), 'getContract').returns(mockContract);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('processTransaction', () => {
    const validTransactionData = {
      id: 'test-tx-123',
      signedTransaction: '0x02f8b00184773594008505d21dba0083030d4094d3e5251e21185b13ea3a5d42dc1f1615865c2e980b844a9059cbb000000000000000000000000b8ce4381d5e4b6a172a9e6122c6932f0f1c5aa1500000000000000000000000000000000000000000000000000038d7ea4c68000c080a0f3d50a6735914f281f5bc80f24fa96326c7c8f1e550a5b90e1d68d3d3eeef873a05eeb3b7a3d0d6423a65c3a9ef8d92b4b39cd5e65ef293435a3d06a6b400a4c5e',
      chainId: 84532
    };

    it('should process a valid transaction successfully', async () => {
      // Mock ethers.Transaction.from
      const mockParsedTx = {
        from: '0x1234567890123456789012345678901234567890',
        to: '0x0987654321098765432109876543210987654321',
        nonce: 5,
        gasPrice: '20000000000'
      };
      sandbox.stub(ethers.Transaction, 'from').returns(mockParsedTx);

      // Mock validation to pass
      sandbox.stub(require('../../src/processors/TransactionProcessor'), 'validateTransactionBeforeBroadcast')
        .resolves({ isValid: true });

      const result = await processTransaction(validTransactionData);

      expect(result).to.have.property('hash', '0x123456789abcdef');
      expect(result).to.have.property('status', 'success');
      expect(result).to.have.property('blockNumber', 12345);
      expect(result).to.have.property('gasUsed', '21000');
    });

    it('should throw error when signedTransaction is missing', async () => {
      const invalidData = { ...validTransactionData };
      delete invalidData.signedTransaction;

      try {
        await processTransaction(invalidData);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Signed transaction is required');
      }
    });

    it('should throw error when chainId is missing', async () => {
      const invalidData = { ...validTransactionData };
      delete invalidData.chainId;

      try {
        await processTransaction(invalidData);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Chain ID is required');
      }
    });

    it('should throw error for invalid signed transaction format', async () => {
      sandbox.stub(ethers.Transaction, 'from').throws(new Error('Invalid transaction format'));

      try {
        await processTransaction(validTransactionData);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Invalid signed transaction format');
      }
    });

    it('should throw error when transaction validation fails', async () => {
      const mockParsedTx = {
        from: '0x1234567890123456789012345678901234567890',
        to: '0x0987654321098765432109876543210987654321'
      };
      sandbox.stub(ethers.Transaction, 'from').returns(mockParsedTx);

      // Mock validation to fail
      sandbox.stub(require('../../src/processors/TransactionProcessor'), 'validateTransactionBeforeBroadcast')
        .resolves({ isValid: false, error: 'Transaction already mined' });

      try {
        await processTransaction(validTransactionData);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Transaction validation failed: Transaction already mined');
      }
    });

    it('should handle provider broadcast errors', async () => {
      const mockParsedTx = {
        from: '0x1234567890123456789012345678901234567890',
        to: '0x0987654321098765432109876543210987654321'
      };
      sandbox.stub(ethers.Transaction, 'from').returns(mockParsedTx);

      // Mock validation to pass
      sandbox.stub(require('../../src/processors/TransactionProcessor'), 'validateTransactionBeforeBroadcast')
        .resolves({ isValid: true });

      // Mock provider to throw error
      mockProvider.broadcastTransaction.rejects(new Error('Network error'));

      try {
        await processTransaction(validTransactionData);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Network error');
      }
    });
  });

  describe('validateTransactionBeforeBroadcast', () => {
    const mockParsedTx = {
      hash: '0x123456789abcdef',
      from: '0x1234567890123456789012345678901234567890',
      nonce: 5
    };

    it('should validate transaction successfully', async () => {
      mockProvider.getTransactionReceipt.resolves(null); // Not already mined
      mockProvider.getTransactionCount.resolves(5); // Current nonce
      mockProvider.getFeeData.resolves({ gasPrice: '20000000000' });

      const result = await validateTransactionBeforeBroadcast(mockParsedTx, mockProvider);

      expect(result.isValid).to.be.true;
    });

    it('should reject transaction that is already mined', async () => {
      mockProvider.getTransactionReceipt.resolves({
        blockNumber: 12345,
        status: 1
      });

      const result = await validateTransactionBeforeBroadcast(mockParsedTx, mockProvider);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Transaction already mined');
    });

    it('should reject transaction with nonce too low', async () => {
      mockProvider.getTransactionReceipt.resolves(null);
      mockProvider.getTransactionCount.resolves(6); // Current nonce higher than tx nonce

      const result = await validateTransactionBeforeBroadcast(mockParsedTx, mockProvider);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Transaction nonce too low');
    });

    it('should warn about low gas price', async () => {
      mockProvider.getTransactionReceipt.resolves(null);
      mockProvider.getTransactionCount.resolves(5);
      mockProvider.getFeeData.resolves({ gasPrice: '30000000000' }); // Higher than tx gas price

      const result = await validateTransactionBeforeBroadcast(mockParsedTx, mockProvider);

      expect(result.isValid).to.be.true;
      // Note: This test doesn't check the warning log, but the function should log a warning
    });

    it('should handle provider errors gracefully', async () => {
      mockProvider.getTransactionReceipt.rejects(new Error('RPC error'));

      const result = await validateTransactionBeforeBroadcast(mockParsedTx, mockProvider);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('RPC error');
    });
  });

  describe('getTransactionStatus', () => {
    it('should return pending status for unmined transaction', async () => {
      mockProvider.getTransactionReceipt.resolves(null);

      const result = await getTransactionStatus('0x123456789abcdef', 84532);

      expect(result.status).to.equal('pending');
      expect(result.receipt).to.be.undefined;
    });

    it('should return success status for successful transaction', async () => {
      const mockReceipt = {
        status: 1,
        blockNumber: 12345,
        gasUsed: '21000',
        effectiveGasPrice: '20000000000'
      };
      mockProvider.getTransactionReceipt.resolves(mockReceipt);

      const result = await getTransactionStatus('0x123456789abcdef', 84532);

      expect(result.status).to.equal('success');
      expect(result.receipt).to.deep.equal({
        blockNumber: 12345,
        gasUsed: '21000',
        effectiveGasPrice: '20000000000'
      });
    });

    it('should return failed status for failed transaction', async () => {
      const mockReceipt = {
        status: 0,
        blockNumber: 12345,
        gasUsed: '21000',
        effectiveGasPrice: '20000000000'
      };
      mockProvider.getTransactionReceipt.resolves(mockReceipt);

      const result = await getTransactionStatus('0x123456789abcdef', 84532);

      expect(result.status).to.equal('failed');
      expect(result.receipt).to.deep.equal({
        blockNumber: 12345,
        gasUsed: '21000',
        effectiveGasPrice: '20000000000'
      });
    });

    it('should handle provider errors', async () => {
      mockProvider.getTransactionReceipt.rejects(new Error('RPC error'));

      try {
        await getTransactionStatus('0x123456789abcdef', 84532);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('RPC error');
      }
    });
  });
}); 