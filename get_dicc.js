const http = require('http');

http.get('http://localhost:5655/api/master-table/dictionary', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log(JSON.stringify(JSON.parse(data), null, 2)));
}).on('error', err => console.log(err));
