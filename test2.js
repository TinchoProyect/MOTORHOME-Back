const { google } = require('googleapis');
const fs = require('fs');
async function test() {
  const keys = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
  const privateKey = keys.private_key;
  
  const client = new google.auth.JWT({
      email: keys.client_email,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive']
  });
  
  await client.authorize();
  const drive = google.drive({ version: 'v3', auth: client });
  try {
     const res = await drive.files.list({ q: "'1ThUWxYRdECRUTc_KYeJjhGPlIPfECyIJ' in parents", fields: 'files(id, name)' });
     console.log('SUCCESS, FOUND FILES:', res.data.files.length);
     console.log(res.data.files);
  } catch (e) {
     console.error('ERROR LISTING:', e.message);
  }
}
test();
