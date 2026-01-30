const fs = require('fs');
const path = require('path');

const keyPath = path.resolve(__dirname, '../../service-account.json');
const keys = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

let privateKey = keys.private_key;
console.log("Raw length:", privateKey.length);
console.log("Has literal \\n?", privateKey.includes('\\n'));

if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
    console.log("Replaced \\n with newlines.");
}

console.log("Processed length:", privateKey.length);
console.log("First 30 chars:", privateKey.substring(0, 30));
console.log("Lines in key:", privateKey.split('\n').length);
