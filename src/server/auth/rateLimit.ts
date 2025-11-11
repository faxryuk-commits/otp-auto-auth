import { getConfig } from '../config';

type RateLimitKey = `phone:${string}` | `ip:${string}`;

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<RateLimitKey, Bucket>();

const HOUR_MS = 60 * 60 * 1000;

export function checkRateLimit(key: RateLimitKey): boolean {
  const config = getConfig();
  const now = Date.now();
  const limit = key.startsWith('phone:')
    ? config.RATE_LIMIT_PHONE_HOURLY
    : config.RATE_LIMIT_IP_HOURLY;

  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts <= HOUR_MS);

  if (bucket.timestamps.length >= limit) {
    buckets.set(key, bucket);
    return false;
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return true;
}

export function resetRateLimit(key: RateLimitKey) {
  buckets.delete(key);
}
