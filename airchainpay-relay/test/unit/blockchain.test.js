const { expect } = require('chai');
const sinon = require('sinon');
const { ethers } = require('ethers');
const { 
  getProvider, 
  getContract, 
  cleanup, 
  validateTransaction, 
  estimateGas 
} = require('../../src/utils/blockchain');

describe('Blockchain Utils Unit Tests', () => {
  let sandbox;
  let mockProvider;
  let mockContract;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Mock provider
    mockProvider = {
      getTransactionReceipt: sandbox.stub(),
      getTransactionCount: sandbox.stub(),
      estimateGas: sandbox.stub()
    };

    // Mock contract
    mockContract = {
      estimateGas: {
        transfer: sandbox.stub()
      }
    };

    // Mock ethers
    sandbox.stub(ethers, 'JsonRpcProvider').returns(mockProvider);
    sandbox.stub(ethers, 'Contract').returns(mockContract);
    sandbox.stub(ethers, 'parseEther').returns('1000000000000000000');
    sandbox.stub(ethers, 'parseUnits').returns('1000000000000000000');
    sandbox.stub(ethers, 'BigNumber').returns({ from: () => '21000' });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getProvider', () => {
    it('should return cached provider for existing chain', () => {
      // Mock config
      const mockConfig = {
        SUPPORTED_CHAINS: {
          84532: {
            rpcUrl: 'https://sepolia.base.org'
          }
        }
      };
      sandbox.stub(require('../../config/default'), 'SUPPORTED_CHAINS').value(mockConfig.SUPPORTED_CHAINS);

      const provider1 = getProvider(84532);
      const provider2 = getProvider(84532);

      expect(provider1).to.equal(provider2);
      expect(ethers.JsonRpcProvider).to.have.been.calledOnce;
    });

    it('should create new provider for new chain', () => {
      // Mock config
      const mockConfig = {
        SUPPORTED_CHAINS: {
          84532: {
            rpcUrl: 'https://sepolia.base.org'
          },
          11155420: {
            rpcUrl: 'https://rpc.test.btcs.network'
          }
        }
      };
      sandbox.stub(require('../../config/default'), 'SUPPORTED_CHAINS').value(mockConfig.SUPPORTED_CHAINS);

      getProvider(84532);
      getProvider(11155420);

      expect(ethers.JsonRpcProvider).to.have.been.calledTwice;
    });

    it('should throw error for unsupported chain', () => {
      // Mock config
      const mockConfig = {
        SUPPORTED_CHAINS: {
          84532: {
            rpcUrl: 'https://sepolia.base.org'
          }
        }
      };
      sandbox.stub(require('../../config/default'), 'SUPPORTED_CHAINS').value(mockConfig.SUPPORTED_CHAINS);

      expect(() => getProvider(999999)).to.throw('Unsupported chain: 999999');
    });
  });

  describe('getContract', () => {
    it('should return cached contract for existing chain', () => {
      // Mock config
      const mockConfig = {
        SUPPORTED_CHAINS: {
          84532: {
            rpcUrl: 'https://sepolia.base.org',
            contractAddress: '0x7B79117445C57eea1CEAb4733020A55e1D503934'
          }
        }
      };
      sandbox.stub(require('../../config/default'), 'SUPPORTED_CHAINS').value(mockConfig.SUPPORTED_CHAINS);

      const contract1 = getContract(84532);
      const contract2 = getContract(84532);

      expect(contract1).to.equal(contract2);
      expect(ethers.Contract).to.have.been.calledOnce;
    });

    it('should throw error for unsupported chain', () => {
      // Mock config
      const mockConfig = {
        SUPPORTED_CHAINS: {
          84532: {
            rpcUrl: 'https://sepolia.base.org',
            contractAddress: '0x7B79117445C57eea1CEAb4733020A55e1D503934'
          }
        }
      };
      sandbox.stub(require('../../config/default'), 'SUPPORTED_CHAINS').value(mockConfig.SUPPORTED_CHAINS);

      expect(() => getContract(999999)).to.throw('Unsupported chain: 999999');
    });

    it('should throw error for chain without contract address', () => {
      // Mock config
      const mockConfig = {
        SUPPORTED_CHAINS: {
          84532: {
            rpcUrl: 'https://sepolia.base.org',
            contractAddress: '0x0000000000000000000000000000000000000000'
          }
        }
      };
      sandbox.stub(require('../../config/default'), 'SUPPORTED_CHAINS').value(mockConfig.SUPPORTED_CHAINS);

      expect(() => getContract(84532)).to.throw('No contract address configured for chain: 84532');
    });
  });

  describe('cleanup', () => {
    it('should clear provider and contract caches', () => {
      // Mock config
      const mockConfig = {
        SUPPORTED_CHAINS: {
          84532: {
            rpcUrl: 'https://sepolia.base.org',
            contractAddress: '0x7B79117445C57eea1CEAb4733020A55e1D503934'
          }
        }
      };
      sandbox.stub(require('../../config/default'), 'SUPPORTED_CHAINS').value(mockConfig.SUPPORTED_CHAINS);

      // Create some cached items
      getProvider(84532);
      getContract(84532);

      // Clear caches
      cleanup();

      // Verify caches are cleared by checking if new instances are created
      getProvider(84532);
      expect(ethers.JsonRpcProvider).to.have.been.calledTwice; // Called again after cleanup
    });
  });

  describe('validateTransaction', () => {
    const validTxData = {
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

    it('should validate complete transaction data', async () => {
      sandbox.stub(ethers, 'isAddress').returns(true);

      const result = await validateTransaction(validTxData);

      expect(result.isValid).to.be.true;
    });

    it('should reject missing transaction data', async () => {
      const result = await validateTransaction(null);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Transaction data is missing');
    });

    it('should reject transaction without ID', async () => {
      const invalidData = { ...validTxData };
      delete invalidData.id;

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid transaction ID');
    });

    it('should reject transaction with invalid ID', async () => {
      const invalidData = { ...validTxData };
      invalidData.id = '';

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid transaction ID');
    });

    it('should reject transaction without recipient', async () => {
      const invalidData = { ...validTxData };
      delete invalidData.to;

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid recipient address');
    });

    it('should reject transaction with invalid recipient address', async () => {
      const invalidData = { ...validTxData };
      invalidData.to = 'invalid-address';

      sandbox.stub(ethers, 'isAddress').returns(false);

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid recipient address');
    });

    it('should reject transaction with invalid amount', async () => {
      const invalidData = { ...validTxData };
      invalidData.amount = 'invalid-amount';

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid transaction amount');
    });

    it('should reject transaction with negative amount', async () => {
      const invalidData = { ...validTxData };
      invalidData.amount = '-1.5';

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid transaction amount');
    });

    it('should reject transaction with invalid chain ID', async () => {
      const invalidData = { ...validTxData };
      invalidData.chainId = 'invalid-chain-id';

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid chain ID');
    });

    it('should reject transaction with invalid timestamp', async () => {
      const invalidData = { ...validTxData };
      invalidData.timestamp = 'invalid-timestamp';

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid timestamp');
    });

    it('should reject transaction with invalid status', async () => {
      const invalidData = { ...validTxData };
      invalidData.status = 'invalid-status';

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid transaction status');
    });

    it('should reject transaction with invalid token address', async () => {
      const invalidData = { ...validTxData };
      invalidData.tokenAddress = 'invalid-token-address';

      sandbox.stub(ethers, 'isAddress').returns(false);

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid token address');
    });

    it('should reject transaction with invalid metadata', async () => {
      const invalidData = { ...validTxData };
      invalidData.metadata = 'not-an-object';

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid metadata format');
    });

    it('should reject transaction with invalid device ID in metadata', async () => {
      const invalidData = { ...validTxData };
      invalidData.metadata.deviceId = 123; // Should be string

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid device ID in metadata');
    });

    it('should reject transaction with invalid retry count in metadata', async () => {
      const invalidData = { ...validTxData };
      invalidData.metadata.retryCount = -1;

      const result = await validateTransaction(invalidData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Invalid retry count in metadata');
    });

    it('should handle validation errors gracefully', async () => {
      sandbox.stub(ethers, 'isAddress').throws(new Error('Ethers error'));

      const result = await validateTransaction(validTxData);

      expect(result.isValid).to.be.false;
      expect(result.error).to.equal('Ethers error');
    });
  });

  describe('estimateGas', () => {
    const validTxData = {
      to: '0x1234567890123456789012345678901234567890',
      amount: '1.5'
    };

    it('should estimate gas for native token transfer', async () => {
      mockProvider.estimateGas.resolves('21000');

      const result = await estimateGas(validTxData, mockProvider);

      expect(result.gasLimit).to.equal('21000');
      expect(result.error).to.be.undefined;
    });

    it('should estimate gas for token transfer', async () => {
      const tokenTxData = {
        ...validTxData,
        tokenAddress: '0x1234567890123456789012345678901234567890'
      };

      mockContract.estimateGas.transfer.resolves('65000');

      const result = await estimateGas(tokenTxData, mockProvider);

      expect(result.gasLimit).to.equal('65000');
      expect(result.error).to.be.undefined;
    });

    it('should return default gas limit on estimation error', async () => {
      mockProvider.estimateGas.rejects(new Error('Estimation failed'));

      const result = await estimateGas(validTxData, mockProvider);

      expect(result.gasLimit).to.equal('21000');
      expect(result.error).to.equal('Estimation failed');
    });

    it('should handle token contract estimation errors', async () => {
      const tokenTxData = {
        ...validTxData,
        tokenAddress: '0x1234567890123456789012345678901234567890'
      };

      mockContract.estimateGas.transfer.rejects(new Error('Token estimation failed'));

      const result = await estimateGas(tokenTxData, mockProvider);

      expect(result.gasLimit).to.equal('21000');
      expect(result.error).to.equal('Token estimation failed');
    });
  });
}); 