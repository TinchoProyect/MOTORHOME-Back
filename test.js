const { google } = require('googleapis');
const fs = require('fs');
async function test() {
  const keys = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
  const privateKey = keys.private_key.includes('\\n') ? keys.private_key.replace(/\\n/g, '\n') : keys.private_key;
  const client = new google.auth.JWT(keys.client_email, null, privateKey, ['https://www.googleapis.com/auth/drive']);
  await client.authorize();
  const drive = google.drive({ version: 'v3', auth: client });
  try {
     const res = await drive.files.list({ q: "'1ThUWxYRdECRUTc_KYeJjhGPlIPfECyIJ' in parents", fields: 'files(id, name)' });
     console.log('SUCCESS, FOUND FILES:', res.data.files.length);
  } catch (e) {
     console.error('ERROR:', e.message);
  }
}
test();
