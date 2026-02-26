import forge from "node-forge";

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqBDWVWS4Bvv5QuIAMdj4
D1meZsSsXOwlcOVCn1M+0hlFornAbPjP+/o2nHZ4AN8p1JUb5cmFF2DB73rSw3ib
fBAvOwHS3glKqRtqcS6zJuovadBp1g4bPbJE/YyTWEVOMkStViNwV55UhRyueeWD
Le8y6vlB4PFA+I2vf7yr6cigYq9oTsRgzJcMob3FDSPQ12zsrSsr6mF1kbTaOCsm
+qbE5nTWkUSTR+fXc4b27fEDYOdTkAhIQV/8BdHOZimoAl0jUSDiQ7a9ARHyUWwT
ajDOgpqsrzgD4uha+mrMU+L6HK4PL1UCvU52bDnfsAGhGzXtsqsOCM7nsYkgEwmi
swIDAQAB
-----END PUBLIC KEY-----`;

export const encryptData = (data) => {
  try {
    const jsonPayload = JSON.stringify(data);

    // 1. Generate a random 32-byte AES Key and 16-byte IV
    const aesKey = forge.random.getBytesSync(32);
    const iv = forge.random.getBytesSync(16);

    // 2. Encrypt the Payload using AES-256-CBC
    const cipher = forge.cipher.createCipher('AES-CBC', aesKey);
    cipher.start({ iv: iv });
    cipher.update(forge.util.createBuffer(jsonPayload, 'utf8'));
    cipher.finish();
    const encryptedPayload = cipher.output.toHex();

    // 3. Encrypt the AES Key using RSA (OAEP SHA-256)
    const publicKey = forge.pki.publicKeyFromPem(PUBLIC_KEY_PEM);
    const encryptedKey = publicKey.encrypt(aesKey, 'RSA-OAEP', {
      md: forge.md.sha256.create(),
    });

    // 4. Return the object expected by the Backend
    return {
      payload: forge.util.encode64(cipher.output.getBytes()), // Base64 Payload
      iv: forge.util.encode64(iv),                            // Base64 IV
      key: forge.util.encode64(encryptedKey)                  // Base64 Encrypted AES Key
    };
  } catch (err) {
    console.error("Encryption Failed:", err);
    throw err;
  }
};