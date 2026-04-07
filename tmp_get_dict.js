const http = require('http');

http.get('http://localhost:5655/api/files/dictionary?providerId=8929039a-407e-40dd-a399-98d17f647dc4', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const result = JSON.parse(data);
        console.log("Dictionary fetched from API:", result);
        
        // Asumiendo que el colIndex es 1 (DESCRIPCION) según el mapeo que vi
        // voy a obtener las descripciones. Pero wait, el endpoint api/files/dictionary
        // No sé cómo devuelve pero vamos a ver...
    });
});
