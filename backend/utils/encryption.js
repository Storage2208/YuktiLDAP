const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const decryptRequest = (encryptedData) => {
    try {
        const { iv, payload, key } = encryptedData;

        //  Read the key from the file directly
        const privateKeyPath = path.join(__dirname, '../keys/private_key.pem');
        const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');

        // 1. Decrypt the AES Key using Private Key
        const aesKeyBuffer = crypto.privateDecrypt(
            {
                key: privateKeyPem,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: "sha256",
            },
            Buffer.from(key, 'base64')
        );

        // 2. Decrypt the Payload using the AES Key
        const decipher = crypto.createDecipheriv(
            'aes-256-cbc',
            aesKeyBuffer,
            Buffer.from(iv, 'base64')
        );

        let decrypted = decipher.update(payload, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return JSON.parse(decrypted);

    } catch (error) {
        console.error("Backend Decryption Failed:", error.message);
        throw new Error("Invalid Encryption Handshake");
    }
};

module.exports = { decryptRequest };