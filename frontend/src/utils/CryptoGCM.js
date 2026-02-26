const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Same secret → same key
 */
async function getKeyFromSecret(secret) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("fixed_salt_value"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt → base64 ( IV | AUTH_TAG | DATA )
 */
export async function encryptToken(plainText, secret) {
  const key = await getKeyFromSecret(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plainText)
  );

  const encryptedBytes = new Uint8Array(encryptedBuffer);
  const authTag = encryptedBytes.slice(
    encryptedBytes.length - AUTH_TAG_LENGTH
  );
  const ciphertext = encryptedBytes.slice(
    0,
    encryptedBytes.length - AUTH_TAG_LENGTH
  );

  const combined = new Uint8Array(
    iv.length + authTag.length + ciphertext.length
  );

  combined.set(iv, 0);
  combined.set(authTag, iv.length);
  combined.set(ciphertext, iv.length + authTag.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt base64 → plain text
 */
export async function decryptToken(encryptedBase64, secret) {
  try {
    const key = await getKeyFromSecret(secret);
    const data = Uint8Array.from(atob(encryptedBase64), c =>
      c.charCodeAt(0)
    );

    const iv = data.slice(0, IV_LENGTH);
    const authTag = data.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = data.slice(IV_LENGTH + AUTH_TAG_LENGTH);

    const combined = new Uint8Array(
      ciphertext.length + authTag.length
    );

    combined.set(ciphertext, 0);
    combined.set(authTag, ciphertext.length);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      combined
    );

    return dec.decode(decryptedBuffer);
  } catch (err) {
    console.error("Decryption failed (tampered or invalid):", err);
    return null;
  }
}
