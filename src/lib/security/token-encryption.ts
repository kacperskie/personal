import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function keyFromSecret(secret: string) {
  return createHash("sha256").update(secret).digest();
}

export function isTokenEncryptionConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.TOKEN_ENCRYPTION_KEY && env.TOKEN_ENCRYPTION_KEY.trim().length >= 32);
}

export function encryptTokenPayload(
  payload: unknown,
  env: NodeJS.ProcessEnv = process.env,
) {
  const secret = env.TOKEN_ENCRYPTION_KEY;

  if (!secret || secret.trim().length < 32) {
    throw new Error("token_encryption_key_missing");
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyFromSecret(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptTokenPayload<T = unknown>(
  encryptedPayload: string,
  env: NodeJS.ProcessEnv = process.env,
): T {
  const secret = env.TOKEN_ENCRYPTION_KEY;

  if (!secret || secret.trim().length < 32) {
    throw new Error("token_encryption_key_missing");
  }

  const [version, ivValue, tagValue, ciphertextValue] = encryptedPayload.split(":");

  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("token_payload_invalid");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    keyFromSecret(secret),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(plaintext) as T;
}
