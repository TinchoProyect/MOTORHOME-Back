const xlsx = require('xlsx');
const crypto = require('crypto');

const bancosParserService = {
    /**
     * Procesa un buffer de Excel y extrae las filas de pagos con CUIT matcheado
     * @param {Buffer} fileBuffer Buffer del archivo Excel
     * @param {Array} proveedores Padrón de proveedores [{id, cuit}]
     * @returns {Object} { pagosValidos, omitidos }
     */
    parseExtracto: (fileBuffer, proveedores) => {
        try {
            console.log(`[BancosParser] Iniciando parseo de Excel...`);
            const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
            
            if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
                throw new Error("El archivo Excel no tiene hojas válidas.");
            }
            
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawData = xlsx.utils.sheet_to_json(firstSheet, { header: 1 }); // Array of arrays
            
            console.log(`[BancosParser] Total de filas crudas: ${rawData.length}`);

            // Heurística de Cabeceras: Buscar fila con ['Fecha', 'Movimiento' | 'Débito']
            let headerRowIndex = -1;
            let headerMap = {};

            for (let i = 0; i < rawData.length && i < 20; i++) {
                const row = rawData[i];
                if (!row) continue;
                
                const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
                if (rowStr.includes('fecha') && (rowStr.includes('movimiento') || rowStr.includes('concepto')) && (rowStr.includes('débito') || rowStr.includes('debito') || rowStr.includes('importe'))) {
                    headerRowIndex = i;
                    // Construir mapa de índices
                    row.forEach((col, idx) => {
                        const colName = String(col || '').toLowerCase().trim();
                        if (colName.includes('fecha')) headerMap['fecha'] = idx;
                        if (colName.includes('movimiento') || colName.includes('concepto') || colName.includes('descrip')) headerMap['movimiento'] = idx;
                        if (colName.includes('débito') || colName.includes('debito') || colName.includes('salida') || colName.includes('importe')) headerMap['debito'] = idx;
                        if (colName.includes('comentario') || colName.includes('observacion')) headerMap['comentario'] = idx;
                    });
                    break;
                }
            }

            if (headerRowIndex === -1) {
                throw new Error("No se pudo detectar la fila de cabeceras (Fecha, Movimiento, Débito). El formato del banco no es reconocido.");
            }

            console.log(`[BancosParser] Cabeceras detectadas en la fila ${headerRowIndex}`);

            const pagosValidos = [];
            const omitidos = {
                sin_cuit: 0,
                cuit_no_encontrado: 0,
                ingresos: 0
            };

            for (let i = headerRowIndex + 1; i < rawData.length; i++) {
                const row = rawData[i];
                if (!row || row.length === 0) continue;

                let fechaRaw = row[headerMap['fecha']];
                let movimientoStr = String(row[headerMap['movimiento']] || '');
                if (headerMap['comentario'] !== undefined && row[headerMap['comentario']]) {
                    movimientoStr += ' | ' + String(row[headerMap['comentario']]);
                }
                let debitoRaw = row[headerMap['debito']];

                // 1. Filtrar solo salidas de dinero (Débito > 0)
                // A veces el excel trae strings con comas, o números
                let debito = 0;
                if (typeof debitoRaw === 'number') {
                    debito = debitoRaw;
                } else if (typeof debitoRaw === 'string') {
                    const cleanStr = debitoRaw.replace(/[^0-9,\.-]/g, '').replace(',', '.');
                    debito = parseFloat(cleanStr);
                }

                if (isNaN(debito) || debito <= 0) {
                    omitidos.ingresos++;
                    continue; // No es un pago, o es un ingreso/crédito
                }

                // Normalizar fecha Excel (número de serie) a String YYYY-MM-DD
                let fechaIso = null;
                if (typeof fechaRaw === 'number') {
                    const dateObj = new Date(Math.round((fechaRaw - 25569) * 86400 * 1000));
                    fechaIso = dateObj.toISOString().split('T')[0];
                } else if (typeof fechaRaw === 'string') {
                    // Intento de parseo DD/MM/YYYY
                    const parts = fechaRaw.split('/');
                    if (parts.length === 3) {
                        fechaIso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    } else {
                        fechaIso = new Date(fechaRaw).toISOString().split('T')[0];
                    }
                }

                if (!fechaIso) fechaIso = new Date().toISOString().split('T')[0]; // fallback

                // 2. Pesca de CUIT (Regex)
                // Buscamos secuencias de 11 dígitos, con o sin guiones
                const cuitRegex = /\b(\d{2})[-]?(\d{8})[-]?(\d{1})\b/;
                const match = movimientoStr.match(cuitRegex);

                if (!match) {
                    omitidos.sin_cuit++;
                    continue;
                }

                // Saneamiento de CUIT extraído
                const cuitPescado = match[1] + match[2] + match[3];

                // 3. Vinculación Unívoca
                const proveedorMatch = proveedores.find(p => p.cuit && p.cuit.replace(/[^0-9]/g, '') === cuitPescado);

                if (!proveedorMatch) {
                    omitidos.cuit_no_encontrado++;
                    continue;
                }

                // 4. Generación de Hash Anti-Duplicados
                // Hash = md5(fechaIso + debito + movimientoLimpio)
                const strForHash = `${fechaIso}_${debito.toFixed(2)}_${movimientoStr.replace(/\s+/g, '').toLowerCase()}`;
                const hash_id = crypto.createHash('md5').update(strForHash).digest('hex');

                pagosValidos.push({
                    hash_id,
                    proveedor_id: proveedorMatch.id,
                    fecha_pago: fechaIso,
                    monto_pago: debito,
                    descripcion_original: movimientoStr,
                    cuit_pescado: cuitPescado,
                    proveedor_nombre: proveedorMatch.razon_social
                });
            }

            console.log(`[BancosParser] Finalizado. Válidos: ${pagosValidos.length}. Sin CUIT: ${omitidos.sin_cuit}. No Encontrados: ${omitidos.cuit_no_encontrado}.`);

            return { success: true, pagosValidos, omitidos };

        } catch (error) {
            console.error("[BancosParser] Error crítico en parseo:", error);
            return { success: false, error: error.message };
        }
    }
};

module.exports = bancosParserService;
