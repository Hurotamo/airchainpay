import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction } from '../types/transaction';

const TX_QUEUE_KEY = 'tx_queue';

export class TxQueue {
  static async getPendingTransactions(): Promise<Transaction[]> {
    try {
      const queueStr = await AsyncStorage.getItem(TX_QUEUE_KEY);
      if (!queueStr) return [];
      const queue = JSON.parse(queueStr);
      return queue.filter((tx: Transaction) => tx.status === 'pending');
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error getting pending transactions:', error);
      } else {
        console.error('Error getting pending transactions:', error);
      }
      return [];
    }
  }

  static async addTransaction(tx: Transaction): Promise<void> {
    try {
      const queueStr = await AsyncStorage.getItem(TX_QUEUE_KEY);
      const queue = queueStr ? JSON.parse(queueStr) : [];
      queue.push(tx);
      await AsyncStorage.setItem(TX_QUEUE_KEY, JSON.stringify(queue));
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error adding transaction to queue:', error);
      } else {
        console.error('Error adding transaction to queue:', error);
      }
    }
  }

  static async updateTransaction(txId: string, updates: Partial<Transaction>): Promise<void> {
    try {
      const queueStr = await AsyncStorage.getItem(TX_QUEUE_KEY);
      if (!queueStr) return;
      const queue = JSON.parse(queueStr);
      const index = queue.findIndex((tx: Transaction) => tx.id === txId);
      if (index === -1) return;
      queue[index] = { ...queue[index], ...updates };
      await AsyncStorage.setItem(TX_QUEUE_KEY, JSON.stringify(queue));
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error updating transaction:', error);
      } else {
        console.error('Error updating transaction:', error);
      }
    }
  }

  static async clearQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(TX_QUEUE_KEY, JSON.stringify([]));
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error clearing transaction queue:', error);
      } else {
        console.error('Error clearing transaction queue:', error);
      }
    }
  }

  static async getQueuedTransactions(): Promise<Transaction[]> {
    try {
      const queueStr = await AsyncStorage.getItem(TX_QUEUE_KEY);
      if (!queueStr) return [];
      const queue = JSON.parse(queueStr);
      return queue.filter((tx: Transaction) => tx.status === 'queued');
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error getting queued transactions:', error);
      } else {
        console.error('Error getting queued transactions:', error);
      }
      return [];
    }
  }

  static async removeTransaction(txId: string): Promise<void> {
    try {
      const queueStr = await AsyncStorage.getItem(TX_QUEUE_KEY);
      if (!queueStr) return;
      let queue = JSON.parse(queueStr);
      queue = queue.filter((tx: Transaction) => tx.id !== txId);
      await AsyncStorage.setItem(TX_QUEUE_KEY, JSON.stringify(queue));
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error removing transaction from queue:', error);
      } else {
        console.error('Error removing transaction from queue:', error);
      }
    }
  }
}

export type TxRow = Transaction;

export async function getAllTransactions(): Promise<Transaction[]> {
  try {
    const queueStr = await AsyncStorage.getItem(TX_QUEUE_KEY);
    if (!queueStr) return [];
    return JSON.parse(queueStr);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error getting all transactions:', error);
    } else {
      console.error('Error getting all transactions:', error);
    }
    return [];
  }
} 