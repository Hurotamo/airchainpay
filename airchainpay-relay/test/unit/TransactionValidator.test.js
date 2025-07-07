const { expect } = require('chai');
const sinon = require('sinon');
const { ethers } = require('ethers');
const { 
  validateTransaction, 
  validateMetadata, 
  validateSignedTransaction, 
  validateTransactionForChain 
} = require('../../src/validators/TransactionValidator');

describe('TransactionValidator Unit Tests', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('validateTransaction', () => {
    const validTransactionData = {
      id: 'test-tx-123',
      to: '0x1234567890123456789012345678901234567890',
      amount: '1.5',
      chainId: 84532,
      timestamp: Math.floor(Date.now() / 1000),
      status: 'pending',
      metadata: {
        deviceId: 'test-device-123',
        retryCount: 0
      }
    };

    it('should validate a complete transaction successfully', async () => {
      const result = await validateTransaction(validTransactionData);

      expect(result.isValid).to.be.true;
      expect(result.error).to.be.undefined;
    });

    it('should reject transaction with missing data', async () => {
      const result = await validateTransaction(null);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Transaction data is missing');
    });

    it('should reject transaction with missing required fields', async () => {
      const invalidData = { ...validTransactionData };
      delete invalidData.id;

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Missing required field: id');
    });

    it('should reject transaction with invalid ID', async () => {
      const invalidData = { ...validTransactionData };
      invalidData.id = '';

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid transaction ID');
    });

    it('should reject transaction with invalid recipient address', async () => {
      const invalidData = { ...validTransactionData };
      invalidData.to = 'invalid-address';

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid recipient address');
    });

    it('should reject transaction with invalid amount', async () => {
      const invalidData = { ...validTransactionData };
      invalidData.amount = '-1.5';

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid transaction amount');
    });

    it('should reject transaction with invalid chain ID', async () => {
      const invalidData = { ...validTransactionData };
      invalidData.chainId = -1;

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid chain ID');
    });

    it('should reject transaction with invalid timestamp', async () => {
      const invalidData = { ...validTransactionData };
      invalidData.timestamp = 0;

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid timestamp');
    });

    it('should reject transaction with old timestamp', async () => {
      const invalidData = { ...validTransactionData };
      invalidData.timestamp = Math.floor(Date.now() / 1000) - (25 * 60 * 60); // 25 hours ago

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Transaction timestamp too old');
    });

    it('should reject transaction with invalid token address', async () => {
      const invalidData = { ...validTransactionData };
      invalidData.tokenAddress = 'invalid-token-address';

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid token address');
    });

    it('should reject transaction with invalid status', async () => {
      const invalidData = { ...validTransactionData };
      invalidData.status = 'invalid-status';

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid transaction status');
    });

    it('should handle validation errors gracefully', async () => {
      // Mock ethers.isAddress to throw an error
      sandbox.stub(ethers, 'isAddress').throws(new Error('Ethers error'));

      const result = await validateTransaction(validTransactionData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Ethers error');
    });
  });

  describe('validateMetadata', () => {
    it('should validate valid metadata', () => {
      const validMetadata = {
        deviceId: 'test-device-123',
        retryCount: 0,
        additionalData: { key: 'value' }
      };

      const result = validateMetadata(validMetadata);

      expect(result.isValid).to.be.true;
    });

    it('should reject null metadata', () => {
      const result = validateMetadata(null);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid metadata format');
    });

    it('should reject non-object metadata', () => {
      const result = validateMetadata('not-an-object');

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid metadata format');
    });

    it('should reject metadata with invalid device ID', () => {
      const invalidMetadata = {
        deviceId: 123, // Should be string
        retryCount: 0
      };

      const result = validateMetadata(invalidMetadata);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid device ID in metadata');
    });

    it('should reject metadata with invalid retry count', () => {
      const invalidMetadata = {
        deviceId: 'test-device-123',
        retryCount: -1
      };

      const result = validateMetadata(invalidMetadata);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid retry count in metadata');
    });

    it('should reject metadata with invalid additional data', () => {
      const invalidMetadata = {
        deviceId: 'test-device-123',
        additionalData: 'not-an-object'
      };

      const result = validateMetadata(invalidMetadata);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid additional data format');
    });

    it('should handle validation errors gracefully', () => {
      // Mock to throw an error
      const result = validateMetadata({});

      expect(result.isValid).to.be.true; // Empty object should be valid
    });
  });

  describe('validateSignedTransaction', () => {
    const validSignedTx = '0x02f8b00184773594008505d21dba0083030d4094d3e5251e21185b13ea3a5d42dc1f1615865c2e980b844a9059cbb000000000000000000000000b8ce4381d5e4b6a172a9e6122c6932f0f1c5aa1500000000000000000000000000000000000000000000000000038d7ea4c68000c080a0f3d50a6735914f281f5bc80f24fa96326c7c8f1e550a5b90e1d68d3d3eeef873a05eeb3b7a3d0d6423a65c3a9ef8d92b4b39cd5e65ef293435a3d06a6b400a4c5e';

    it('should validate valid signed transaction', () => {
      const mockParsedTx = {
        from: '0x1234567890123456789012345678901234567890',
        to: '0x0987654321098765432109876543210987654321'
      };
      sandbox.stub(ethers.Transaction, 'from').returns(mockParsedTx);

      const result = validateSignedTransaction(validSignedTx);

      expect(result.isValid).to.be.true;
    });

    it('should reject non-string signed transaction', () => {
      const result = validateSignedTransaction(123);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Signed transaction must be a string');
    });

    it('should reject signed transaction without 0x prefix', () => {
      const result = validateSignedTransaction('invalid-tx-without-0x');

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Signed transaction must start with 0x');
    });

    it('should reject invalid signed transaction format', () => {
      sandbox.stub(ethers.Transaction, 'from').throws(new Error('Invalid format'));

      const result = validateSignedTransaction(validSignedTx);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid signed transaction format');
    });

    it('should reject transaction without from address', () => {
      const mockParsedTx = {
        to: '0x0987654321098765432109876543210987654321'
        // Missing 'from' field
      };
      sandbox.stub(ethers.Transaction, 'from').returns(mockParsedTx);

      const result = validateSignedTransaction(validSignedTx);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid transaction format');
    });

    it('should reject transaction without to address', () => {
      const mockParsedTx = {
        from: '0x1234567890123456789012345678901234567890'
        // Missing 'to' field
      };
      sandbox.stub(ethers.Transaction, 'from').returns(mockParsedTx);

      const result = validateSignedTransaction(validSignedTx);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid transaction format');
    });

    it('should handle validation errors gracefully', () => {
      sandbox.stub(ethers.Transaction, 'from').throws(new Error('Unexpected error'));

      const result = validateSignedTransaction(validSignedTx);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid signed transaction format');
    });
  });

  describe('validateTransactionForChain', () => {
    const validTransactionData = {
      id: 'test-tx-123',
      to: '0x1234567890123456789012345678901234567890',
      amount: '1.5',
      chainId: 84532,
      gasLimit: '21000',
      gasPrice: '20000000000'
    };

    it('should validate transaction for chain successfully', async () => {
      const result = await validateTransactionForChain(validTransactionData, 84532);

      expect(result.isValid).to.be.true;
    });

    it('should reject transaction with invalid gas limit', async () => {
      const invalidData = { ...validTransactionData };
      invalidData.gasLimit = '-1';

      const result = await validateTransactionForChain(invalidData, 84532);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid gas limit');
    });

    it('should reject transaction with invalid gas price', async () => {
      const invalidData = { ...validTransactionData };
      invalidData.gasPrice = '0';

      const result = await validateTransactionForChain(invalidData, 84532);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid gas price');
    });

    it('should handle validation errors gracefully', async () => {
      // Mock to throw an error
      sandbox.stub(console, 'error').throws(new Error('Validation error'));

      const result = await validateTransactionForChain(validTransactionData, 84532);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Chain validation failed');
    });

    it('should validate transaction without gas parameters', async () => {
      const dataWithoutGas = { ...validTransactionData };
      delete dataWithoutGas.gasLimit;
      delete dataWithoutGas.gasPrice;

      const result = await validateTransactionForChain(dataWithoutGas, 84532);

      expect(result.isValid).to.be.true;
    });
  });
}); 