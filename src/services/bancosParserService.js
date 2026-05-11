const xlsx = require('xlsx');
const crypto = require('crypto');

const bancosParserService = {
    /**
     * Procesa un buffer de Excel y extrae las filas de pagos con CUIT matcheado o huérfanas
     * @param {Buffer} fileBuffer Buffer del archivo Excel
     * @param {Array} proveedores Padrón de proveedores [{id, cuit}]
     * @param {Array} memoriaMapeo Diccionario de mapeos manuales [{patron_busqueda, proveedor_id}]
     * @param {String} archivoId ID de Google Drive
     * @returns {Object} { pagosCrudos, estadisticas }
     */
    parseExtracto: (fileBuffer, proveedores, memoriaMapeo, archivoId) => {
        try {
            console.log(`[BancosParser] Iniciando parseo de Excel...`);
            const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
            
            if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
                throw new Error("El archivo Excel no tiene hojas válidas.");
            }
            
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawData = xlsx.utils.sheet_to_json(firstSheet, { header: 1 }); // Array of arrays
            
            console.log(`[BancosParser] Total de filas crudas: ${rawData.length}`);

            // Heurística de Cabeceras
            let headerRowIndex = -1;
            let headerMap = {};

            for (let i = 0; i < rawData.length && i < 20; i++) {
                const row = rawData[i];
                if (!row) continue;
                
                const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
                // Heurística flexible para encontrar la cabecera
                if ((rowStr.includes('fec') || rowStr.includes('fecha')) && 
                    (rowStr.includes('movimiento') || rowStr.includes('concepto') || rowStr.includes('detalle') || rowStr.includes('descrip')) && 
                    (rowStr.includes('debito') || rowStr.includes('débito') || rowStr.includes('importe') || rowStr.includes('salida') || rowStr.includes('cargo'))) {
                    
                    headerRowIndex = i;
                    row.forEach((col, idx) => {
                        const colName = String(col || '').toLowerCase().trim();
                        if (colName.includes('fec') || colName.includes('fecha')) headerMap['fecha'] = idx;
                        if (colName.includes('movimiento') || colName.includes('concepto') || colName.includes('descrip') || colName.includes('detalle')) headerMap['movimiento'] = idx;
                        if (colName.includes('debito') || colName.includes('débito') || colName.includes('salida') || colName.includes('importe') || colName.includes('cargo')) headerMap['debito'] = idx;
                        if (colName.includes('comentario') || colName.includes('observacion')) headerMap['comentario'] = idx;
                        if (colName.includes('saldo')) headerMap['saldo'] = idx;
                        if (colName.includes('referencia') || colName.includes('ref') || colName.includes('comprobante')) headerMap['referencia'] = idx;
                    });
                    break;
                }
            }

            if (headerRowIndex === -1) {
                // Fallback posicional si no se detectan cabeceras
                headerRowIndex = 0;
                headerMap['fecha'] = 0;
                headerMap['movimiento'] = 1;
                headerMap['debito'] = 2;
                console.warn("[BancosParser] No se detectó cabecera clara. Usando fallback posicional.");
            }

            const pagosCrudos = [];
            const stats = {
                procesados: 0,
                auto_vinculados_cuit: 0,
                auto_vinculados_memoria: 0,
                pendientes_hitl: 0,
                ignorados_ingresos: 0
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

                let debito = 0;
                if (typeof debitoRaw === 'number') {
                    debito = debitoRaw;
                } else if (typeof debitoRaw === 'string') {
                    let cleanStr = debitoRaw.replace(/[^0-9,\.-]/g, '');
                    // Formato AR 1.500,00 -> 1500.00
                    if (cleanStr.includes(',') && cleanStr.includes('.')) {
                        cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
                    } else if (cleanStr.includes(',')) {
                        cleanStr = cleanStr.replace(',', '.');
                    }
                    debito = parseFloat(cleanStr);
                }

                if (isNaN(debito) || debito === 0) {
                    stats.ignorados_ingresos++;
                    continue; // Ignoramos si es cero o no parseable
                }

                // Tomamos el valor absoluto (si el banco pone débitos en negativo, los convertimos a monto absoluto)
                const montoFinal = Math.abs(debito);

                let fechaIso = null;
                if (typeof fechaRaw === 'number') {
                    const dateObj = new Date(Math.round((fechaRaw - 25569) * 86400 * 1000));
                    fechaIso = dateObj.toISOString().split('T')[0];
                } else if (typeof fechaRaw === 'string') {
                    const parts = fechaRaw.split('/');
                    if (parts.length === 3) {
                        fechaIso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    } else {
                        fechaIso = new Date(fechaRaw).toISOString().split('T')[0];
                    }
                }
                if (!fechaIso) fechaIso = new Date().toISOString().split('T')[0];

                let saldoStr = headerMap['saldo'] !== undefined ? String(row[headerMap['saldo']] || '').replace(/\s+/g, '').toLowerCase() : '';
                let refStr = headerMap['referencia'] !== undefined ? String(row[headerMap['referencia']] || '').replace(/\s+/g, '').toLowerCase() : '';

                const strForHash = `${fechaIso}_${debito.toFixed(2)}_${movimientoStr.replace(/\s+/g, '').toLowerCase()}_${saldoStr}_${refStr}`;
                const hash_id = crypto.createHash('md5').update(strForHash).digest('hex');

                let estado = 'PENDIENTE';
                let proveedor_id = null;
                let cuitPescado = null;

                // 1. Matcheo por CUIT (Máxima Certeza)
                const cuitRegex = /\b(\d{2})[-]?(\d{8})[-]?(\d{1})\b/;
                const match = movimientoStr.match(cuitRegex);
                
                if (match) {
                    cuitPescado = match[1] + match[2] + match[3];
                    const proveedorMatch = proveedores.find(p => p.cuit && p.cuit.replace(/[^0-9]/g, '') === cuitPescado);
                    if (proveedorMatch) {
                        proveedor_id = proveedorMatch.id;
                        estado = 'AUTO_VINCULADO';
                        stats.auto_vinculados_cuit++;
                    }
                }

                // 2. Matcheo por Memoria (Si no hubo CUIT o no se encontró)
                if (estado === 'PENDIENTE' && memoriaMapeo && memoriaMapeo.length > 0) {
                    const movimientoLower = movimientoStr.toLowerCase();
                    const hitMemoria = memoriaMapeo.find(m => movimientoLower.includes(m.patron_busqueda.toLowerCase()));
                    if (hitMemoria) {
                        proveedor_id = hitMemoria.proveedor_id;
                        estado = 'AUTO_VINCULADO'; // Se trata igual que vinculado, se dispara el trigger
                        stats.auto_vinculados_memoria++;
                    }
                }

                if (estado === 'PENDIENTE') {
                    stats.pendientes_hitl++;
                }

                pagosCrudos.push({
                    hash_id,
                    archivo_origen_id: archivoId,
                    proveedor_id,
                    fecha_pago: fechaIso,
                    monto_pago: montoFinal,
                    descripcion_original: movimientoStr,
                    cuit_detectado: cuitPescado,
                    estado
                });
                
                stats.procesados++;
            }

            console.log(`[BancosParser] Finalizado. Procesados: ${stats.procesados}. Auto (CUIT): ${stats.auto_vinculados_cuit}. Auto (Memoria): ${stats.auto_vinculados_memoria}. Pendientes (HITL): ${stats.pendientes_hitl}.`);

            return { success: true, pagosCrudos, estadisticas: stats };

        } catch (error) {
            console.error("[BancosParser] Error crítico en parseo:", error);
            return { success: false, error: error.message };
        }
    }
};

module.exports = bancosParserService;
