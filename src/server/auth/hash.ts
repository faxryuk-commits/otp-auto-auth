import argon2 from 'argon2';

export async function hashToken(token: string): Promise<string> {
  return argon2.hash(token, {
    type: argon2.argon2id,
    timeCost: 2,
    memoryCost: 15360,
    parallelism: 1,
  });
}

export async function verifyToken(hash: string, token: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, token);
  } catch {
    return false;
  }
}
