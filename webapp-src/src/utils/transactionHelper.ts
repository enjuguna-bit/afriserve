/**
 * Transaction Helper
 * Simplifies database transaction management with automatic rollback
 */

import { prisma } from '../db.js';
import type { PrismaClient } from '@prisma/client';
import { Logger } from './logger.js';

export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'
>;

export interface TransactionOptions {
  timeout?: number;
  isolationLevel?: 'ReadUncommitted' | 'ReadCommitted' | 'RepeatableRead' | 'Serializable';
  maxWait?: number;
}

/**
 * Execute operation within a database transaction
 * Automatically rolls back on error
 */
export async function withTransaction<T>(
  operation: (tx: TransactionClient) => Promise<T>,
  options?: TransactionOptions
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        return await operation(tx);
      },
      {
        timeout: options?.timeout || 10000,
        maxWait: options?.maxWait || 5000,
        isolationLevel: options?.isolationLevel,
      }
    );

    const duration = Date.now() - startTime;
    Logger.performance('database_transaction', duration, {
      status: 'success',
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    Logger.error('Transaction failed', error as Error, {
      duration,
    });
    throw error;
  }
}

/**
 * Execute multiple operations in a single transaction
 * Useful for complex multi-step workflows
 */
export async function withTransactionSteps<T>(
  steps: Array<(tx: TransactionClient) => Promise<void>>,
  options?: TransactionOptions
): Promise<void> {
  await withTransaction(async (tx) => {
    for (let i = 0; i < steps.length; i++) {
      Logger.debug(`Executing transaction step ${i + 1}/${steps.length}`);
      await steps[i](tx);
    }
  }, options);
}

/**
 * Execute operation with retry logic (for transient failures)
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: {
    maxRetries?: number;
    delayMs?: number;
    backoffMultiplier?: number;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries || 3;
  const delayMs = options?.delayMs || 1000;
  const backoffMultiplier = options?.backoffMultiplier || 2;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const waitTime = delayMs * Math.pow(backoffMultiplier, attempt);
        Logger.warn(`Operation failed, retrying in ${waitTime}ms`, {
          attempt: attempt + 1,
          maxRetries,
          error: lastError.message,
        });
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError;
}
