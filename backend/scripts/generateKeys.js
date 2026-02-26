const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 1. Generate RSA Key Pair
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

// 2. Define Output Paths (Save in the 'backend' root folder)
const privateKeyPath = path.join(__dirname, '../private_key.pem');
const publicKeyPath = path.join(__dirname, '../public_key.pem');

// 3. Save Keys to Files
fs.writeFileSync(privateKeyPath, privateKey);
fs.writeFileSync(publicKeyPath, publicKey);

console.log("\n Keys Generated Successfully!");
console.log(` Private Key saved to: ${privateKeyPath}`);
console.log(` Public Key saved to: ${publicKeyPath}`);