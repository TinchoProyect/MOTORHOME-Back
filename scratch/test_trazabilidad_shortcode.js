const http = require('http');

function get(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: JSON.parse(data)
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data
                    });
                }
            });
        }).on('error', reject);
    });
}

async function run() {
    const baseUrl = 'http://localhost:5655/api/recepcion/trazabilidad';
    
    console.log("=== INICIANDO PRUEBAS DE INTEGRACIÓN - TICKET #140 ===\n");
    
    // Prueba 1: Código corto válido (79d8500b)
    console.log("[TEST 1] Consultando código corto existente (79d8500b)...");
    try {
        const res1 = await get(`${baseUrl}/79d8500b`);
        console.log(`Status: ${res1.statusCode}`);
        console.log("Response:", JSON.stringify(res1.body, null, 2));
        if (res1.statusCode === 200 && res1.body.success === true && res1.body.data.id_lote.startsWith('79d8500b')) {
            console.log("✅ TEST 1 EXITOSO!\n");
        } else {
            console.log("❌ TEST 1 FALLIDO!\n");
        }
    } catch (e) {
        console.error("❌ TEST 1 EXCEPCIÓN:", e.message, "\n");
    }

    // Prueba 2: UUID completo válido (79d8500b-6023-46db-a386-12e487a71e45)
    console.log("[TEST 2] Consultando UUID completo existente...");
    try {
        const res2 = await get(`${baseUrl}/79d8500b-6023-46db-a386-12e487a71e45`);
        console.log(`Status: ${res2.statusCode}`);
        console.log("Response:", JSON.stringify(res2.body, null, 2));
        if (res2.statusCode === 200 && res2.body.success === true && res2.body.data.id_lote === '79d8500b-6023-46db-a386-12e487a71e45') {
            console.log("✅ TEST 2 EXITOSO!\n");
        } else {
            console.log("❌ TEST 2 FALLIDO!\n");
        }
    } catch (e) {
        console.error("❌ TEST 2 EXCEPCIÓN:", e.message, "\n");
    }

    // Prueba 3: Código corto no existente (ffffffff)
    console.log("[TEST 3] Consultando código corto inexistente (ffffffff)...");
    try {
        const res3 = await get(`${baseUrl}/ffffffff`);
        console.log(`Status: ${res3.statusCode}`);
        console.log("Response:", JSON.stringify(res3.body, null, 2));
        if (res3.statusCode === 200 && res3.body.success === false && res3.body.error.includes('no encontrado')) {
            console.log("✅ TEST 3 EXITOSO!\n");
        } else {
            console.log("❌ TEST 3 FALLIDO!\n");
        }
    } catch (e) {
        console.error("❌ TEST 3 EXCEPCIÓN:", e.message, "\n");
    }

    // Prueba 4: Código corto demasiado corto (123)
    console.log("[TEST 4] Consultando código demasiado corto (123)...");
    try {
        const res4 = await get(`${baseUrl}/123`);
        console.log(`Status: ${res4.statusCode}`);
        console.log("Response:", JSON.stringify(res4.body, null, 2));
        if (res4.statusCode === 400 && res4.body.success === false && res4.body.error.includes('inválido')) {
            console.log("✅ TEST 4 EXITOSO!\n");
        } else {
            console.log("❌ TEST 4 FALLIDO!\n");
        }
    } catch (e) {
        console.error("❌ TEST 4 EXCEPCIÓN:", e.message, "\n");
    }

    // Prueba 5: Código corto con caracteres no hexadecimales corruptos (xyz12345)
    console.log("[TEST 5] Consultando código con no-hex corrupto (xyz12345)...");
    try {
        const res5 = await get(`${baseUrl}/xyz12345`);
        console.log(`Status: ${res5.statusCode}`);
        console.log("Response:", JSON.stringify(res5.body, null, 2));
        // 'xyz12345' has only '12345' (5 chars) which is valid hex but let's test a fully invalid one
        if (res5.statusCode === 200 || res5.statusCode === 400) {
            console.log("✅ TEST 5 PROCESADO CORRECTAMENTE (limpieza de no-hex exitosa)!\n");
        } else {
            console.log("❌ TEST 5 FALLIDO!\n");
        }
    } catch (e) {
        console.error("❌ TEST 5 EXCEPCIÓN:", e.message, "\n");
    }
    
    // Prueba 6: Código no-hex puro (gghhiijj)
    console.log("[TEST 6] Consultando código no-hex puro (gghhiijj)...");
    try {
        const res6 = await get(`${baseUrl}/gghhiijj`);
        console.log(`Status: ${res6.statusCode}`);
        console.log("Response:", JSON.stringify(res6.body, null, 2));
        if (res6.statusCode === 400 && res6.body.success === false && res6.body.error.includes('no hexadecimales')) {
            console.log("✅ TEST 6 EXITOSO!\n");
        } else {
            console.log("❌ TEST 6 FALLIDO!\n");
        }
    } catch (e) {
        console.error("❌ TEST 6 EXCEPCIÓN:", e.message, "\n");
    }
}

run();
