const http = require('http');

const payload = JSON.stringify({
  column_name: "MARCA",
  prompt: "Extraer marca",
  samples: ["ANANA CUMANA", "MANDARINA ARCOR", "PIMIENTA CUMANA"]
});

const req = http.request({
  hostname: 'localhost',
  port: 5655,
  path: '/api/ai/discover-entities',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('RESPONSE:', res.statusCode, data));
});

req.on('error', e => console.error('FAIL:', e.message));
req.write(payload);
req.end();
