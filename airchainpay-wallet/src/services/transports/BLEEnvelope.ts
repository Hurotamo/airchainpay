export const BLE_PROTOCOL_VERSION = '1.0.0' as const;

export type BLEMessageType =
  | 'payment_request'
  | 'transaction_confirmation'
  | 'advertiser_confirmation'
  | 'error';

export interface BLEEnvelope<T = unknown> {
  type: BLEMessageType;
  version: typeof BLE_PROTOCOL_VERSION;
  sessionId: string;
  nonce: string;
  hmac: string;
  payload: T;
}

const allowedTypes: Set<BLEMessageType> = new Set([
  'payment_request',
  'transaction_confirmation',
  'advertiser_confirmation',
  'error',
]);

export function createEnvelope<T>(
  type: BLEMessageType,
  payload: T,
  sessionId: string = 'no-session',
  nonce: string = '0',
  hmac: string = ''
): BLEEnvelope<T> {
  return {
    type,
    version: BLE_PROTOCOL_VERSION,
    sessionId,
    nonce,
    hmac,
    payload,
  };
}

export function parseEnvelope<T = unknown>(raw: string): BLEEnvelope<T> {
  const env = JSON.parse(raw) as Partial<BLEEnvelope<T>>;

  if (env.version !== BLE_PROTOCOL_VERSION) {
    throw new Error('UNSUPPORTED_VERSION');
  }

  if (!env.type || !allowedTypes.has(env.type as BLEMessageType)) {
    throw new Error('INVALID_TYPE');
  }

  // Minimal required fields validation
  if (!('payload' in env)) {
    throw new Error('MALFORMED_ENVELOPE');
  }

  // Default optional security fields when not set yet
  return {
    type: env.type as BLEMessageType,
    version: BLE_PROTOCOL_VERSION,
    sessionId: (env.sessionId as string) || 'no-session',
    nonce: (env.nonce as string) || '0',
    hmac: (env.hmac as string) || '',
    payload: env.payload as T,
  };
}

