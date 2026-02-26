import CryptoJS from "crypto-js";

const IV = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");

function getKeyFromSecret(secret) {
  return CryptoJS.SHA256(secret); // WordArray (32 bytes)
}

export function decryptToken(encryptedBase64, secret) {
  try {
    const KEY = getKeyFromSecret(secret);

    // 🔹 Parse base64 ciphertext exactly like Node output
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(encryptedBase64),
    });

    const decrypted = CryptoJS.AES.decrypt(cipherParams, KEY, {
      iv: IV,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const result = decrypted.toString(CryptoJS.enc.Utf8);
    return result || null;
  } catch (err) {
    console.error("Decrypt failed:", err);
    return null;
  }
}
