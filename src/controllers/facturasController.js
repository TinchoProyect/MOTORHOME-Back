const aiService = require('../services/aiService');
const driveService = require('../services/driveService');
const { applyBillingRule } = require('../services/billingRules');
const { applyConciliationRule } = require('../services/conciliationRules');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// HELPER: Heurística avanzada de matching para descripciones difusas (Jaccard-Levenshtein híbrido)
function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    let matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
}

function areWordsSimilar(w1, w2) {
    if (w1 === w2) return true;
    
    // Quick check for abbreviation
    if (w1.length === 1 && w2.startsWith(w1)) return true;
    if (w2.length === 1 && w1.startsWith(w2)) return true;
    
    // Solo permitir match por subcadena si ambas palabras tienen 3 o más letras
    // Esto evita que letras sueltas (ej. "a", "s", "r") actúen como comodines salvajes
    if (w1.length >= 3 && w2.length >= 3) {
        if (w1.includes(w2) || w2.includes(w1)) return true;
    }
    
    const dist = levenshtein(w1, w2);
    const maxLen = Math.max(w1.length, w2.length);
    
    if (maxLen <= 3 && dist <= 1) return true; // Permitir ws y w3s
    if (maxLen > 3 && maxLen <= 5 && dist <= 1) return true;
    if (maxLen > 5 && dist <= 2) return true;
    return false;
}

function calculateSimilarityScore(descFactura, descPedido) {
    if (!descFactura || !descPedido) return 0;
    
    // Stop words y unidades logísticas que generan ruido semántico
    const STOP_WORDS = new Set(['de', 'sin', 'con', 'y', 'el', 'la', 'los', 'las', 'en', 'por', 'para', 'x', 'kg', 'gr', 'g', 'ml', 'l', 'cm', 'mm', 'un', 'una', 'caja', 'bulto', 'bultos', 'kilo', 'kilos', 'litro', 'litros']);

    const s1 = descFactura.toLowerCase().replace(/[^a-záéíóúñ0-9\s]/gi, ' ').split(/\s+/).filter(w => w.length > 0 && !STOP_WORDS.has(w));
    const s2 = descPedido.toLowerCase().replace(/[^a-záéíóúñ0-9\s]/gi, ' ').split(/\s+/).filter(w => w.length > 0 && !STOP_WORDS.has(w));
    
    if (s1.length === 0 || s2.length === 0) return 0;

    let matches = 0;
    const usedS2 = new Set();
    
    for (let w1 of s1) {
        let bestMatchIdx = -1;
        for (let i = 0; i < s2.length; i++) {
            if (usedS2.has(i)) continue;
            if (areWordsSimilar(w1, s2[i])) {
                bestMatchIdx = i;
                if (w1 === s2[i]) break; // exact match priority
            }
        }
        if (bestMatchIdx !== -1) {
            matches++;
            usedS2.add(bestMatchIdx);
        }
    }
    
    return matches / Math.min(s1.length, s2.length);
}

const facturasController = {
    extractInvoice: async (req, res) => {
        const { providerId, fileId, fileName } = req.body;
        if (!providerId || !fileId || !fileName) {
            return res.status(400).json({ error: "Faltan parámetros: providerId, fileId, o fileName" });
        }

        try {
            console.log(`[FacturasController] Extrayendo factura ${fileName} (${fileId}) para proveedor ${providerId}`);
            
            // 1. Check if it already exists in facturas_raw
            const { data: existing, error: errExist } = await supabase
                .from('facturas_raw')
                .select('*')
                .eq('archivo_id', fileId)
                .single();

            if (existing) {
                // Verificar si la extracción antigua no tiene la grilla de artículos (Refinamiento Etapa 2)
                const hasArticulos = existing.articulos && Array.isArray(existing.articulos) && existing.articulos.length > 0;
                
                if (hasArticulos || existing.status === 'REVISADO_HITL') {
                    console.log(`[FacturasController] Factura ya extraída previamente con grilla. Retornando caché.`);
                    return res.json({ success: true, data: existing });
                } else {
                    console.log(`[FacturasController] Caché antigua detectada sin artículos. Forzando re-extracción IA...`);
                    // Procederá a descargar y extraer de nuevo, haciendo un UPDATE al final en lugar de INSERT
                }
            }

            // 2. Descargar el Buffer binario directamente del Drive
            const buffer = await driveService.downloadFileToBuffer(fileId);
            
            // Convertir a base64 para Gemini
            const base64Data = buffer.toString('base64');
            
            // Soporte Multiformato IA (Deducir MimeType)
            let mimeType = 'application/pdf'; // Default
            const lowerFileName = fileName.toLowerCase();
            if (lowerFileName.endsWith('.jpg') || lowerFileName.endsWith('.jpeg')) {
                mimeType = 'image/jpeg';
            } else if (lowerFileName.endsWith('.png')) {
                mimeType = 'image/png';
            } else if (lowerFileName.endsWith('.webp')) {
                mimeType = 'image/webp';
            }
            
            // Construimos el Data URI esperado por el Motor Chofer
            const dataUrl = `data:${mimeType};base64,${base64Data}`;
            
            // 3. Obtener el Mapa de Extracción IA y CUIT específico del proveedor
            let mapaExtraccion = null;
            let cuitProveedor = null;
            const { data: proveedorInfo } = await supabase
                .from('proveedores')
                .select('mapa_extraccion_ia, cuit')
                .eq('id', providerId)
                .single();
            
            if (proveedorInfo) {
                if (proveedorInfo.mapa_extraccion_ia) {
                    mapaExtraccion = proveedorInfo.mapa_extraccion_ia;
                    console.log(`[FacturasController] Mapa de Extracción detectado para el proveedor. Inyectando directivas en IA.`);
                }
                if (proveedorInfo.cuit) {
                    cuitProveedor = proveedorInfo.cuit;
                }
            }

            let intentos = 0;
            const MAX_INTENTOS = 3;
            let saneamientoJson = null;

            while (intentos < MAX_INTENTOS) {
                intentos++;
                console.log(`[FacturasController] Extracción IA (Intento ${intentos}/${MAX_INTENTOS})...`);
                
                try {
                    const extractedJson = await aiService.executeInvoiceExtraction(dataUrl, mimeType, mapaExtraccion, cuitProveedor);
                    
                    // ==========================================
                    // MIDDLEWARE DE SANEAMIENTO Y CHECKSUM
                    // ==========================================
                    saneamientoJson = applyBillingRule(providerId, null, extractedJson);
                    
                    if (saneamientoJson.checksum_valido) {
                        console.log(`[FacturasController] Checksum Verde logrado en intento ${intentos}. Éxito.`);
                        break;
                    } else {
                        console.warn(`[FacturasController] Checksum Rojo en intento ${intentos}. Desvío: $${saneamientoJson.checksum_diferencia}`);
                    }
                } catch (iaError) {
                    console.error(`[FacturasController] Fallo en servicio IA en intento ${intentos}:`, iaError.message);
                    if (intentos >= MAX_INTENTOS) throw iaError;
                }
            }

            // Si agotó intentos y no tiene data válida, tiramos error o seguimos con el rojo
            if (!saneamientoJson) {
                throw new Error("La Inteligencia Artificial falló en retornar un JSON estructurado luego de 3 intentos.");
            }

            // 4. Save or Update Database
            const newRecord = {
                proveedor_id: providerId,
                archivo_id: fileId,
                archivo_nombre: fileName,
                status: 'PENDIENTE',
                cuit_emisor: saneamientoJson.cuit_emisor || null,
                punto_venta: saneamientoJson.punto_venta || null,
                numero_comprobante: saneamientoJson.numero_comprobante || null,
                tipo_comprobante: saneamientoJson.tipo_comprobante || null,
                fecha_emision: saneamientoJson.fecha_emision || null,
                fecha_vto_cae: saneamientoJson.fecha_vto_cae || null,
                cae: saneamientoJson.cae || null,
                importe_neto_gravado: saneamientoJson.importe_neto_gravado || 0,
                importe_iva_21: saneamientoJson.importe_iva_21 || 0,
                importe_iva_105: saneamientoJson.importe_iva_105 || 0,
                importe_iva_27: saneamientoJson.importe_iva_27 || 0,
                percepciones_iibb: saneamientoJson.percepciones_iibb || 0,
                percepciones_iva: saneamientoJson.percepciones_iva || 0,
                conceptos_no_gravados: saneamientoJson.conceptos_no_gravados || 0,
                importe_total: saneamientoJson.importe_total || 0,
                articulos: saneamientoJson.articulos || [],
                datos_extraidos: saneamientoJson
            };

            let finalData;
            if (existing) {
                // Actualizar registro existente (Refinamiento retroactivo)
                const { data: updated, error: updateError } = await supabase
                    .from('facturas_raw')
                    .update(newRecord)
                    .eq('id', existing.id)
                    .select()
                    .single();
                
                if (updateError) throw updateError;
                finalData = updated;
            } else {
                // Insertar nuevo registro
                const { data: inserted, error: insertError } = await supabase
                    .from('facturas_raw')
                    .insert([newRecord])
                    .select()
                    .single();

                if (insertError) throw insertError;
                finalData = inserted;
            }

            return res.json({ success: true, data: finalData });

        } catch (error) {
            console.error("[FacturasController] Error:", error);
            res.status(500).json({ error: error.message });
        }
    },

    saveHITL: async (req, res) => {
        const { id } = req.params;
        const updateData = req.body;

        try {
            console.log(`[FacturasController] Guardando validación HITL para factura ${id}`);
            
            // Forzamos el status a REVISADO_HITL
            updateData.status = 'REVISADO_HITL';
            updateData.updated_at = new Date().toISOString();

            const { data, error } = await supabase
                .from('facturas_raw')
                .update(updateData)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            return res.json({ success: true, data });
        } catch (error) {
            console.error("[FacturasController] Error saveHITL:", error);
            res.status(500).json({ error: error.message });
        }
    },

    deleteFactura: async (req, res) => {
        const { id } = req.params;

        try {
            console.log(`[FacturasController] Eliminando extracción de factura ${id}`);

            const { error } = await supabase
                .from('facturas_raw')
                .delete()
                .eq('id', id);

            if (error) throw error;

            return res.json({ success: true, message: 'Extracción eliminada correctamente.' });
        } catch (error) {
            console.error("[FacturasController] Error deleteFactura:", error);
            res.status(500).json({ error: error.message });
        }
    },

    getPdfProxy: async (req, res) => {
        const { fileId } = req.params;
        const fileName = req.query.name || '';
        try {
            console.log(`[FacturasController] Sirviendo archivo por Proxy para bypass CSP: ${fileId} (${fileName})`);
            const buffer = await driveService.downloadFileToBuffer(fileId);
            
            let mimeType = 'application/pdf';
            const lowerFileName = fileName.toLowerCase();
            if (lowerFileName.endsWith('.jpg') || lowerFileName.endsWith('.jpeg')) {
                mimeType = 'image/jpeg';
            } else if (lowerFileName.endsWith('.png')) {
                mimeType = 'image/png';
            } else if (lowerFileName.endsWith('.webp')) {
                mimeType = 'image/webp';
            }
            
            res.setHeader('Content-Type', mimeType);
            // 'inline' permite que el navegador lo renderice en el iframe en lugar de descargarlo
            res.setHeader('Content-Disposition', `inline; filename="${fileName || `factura_${fileId}.pdf`}"`);
            
            res.send(buffer);
        } catch (error) {
            console.error("[FacturasController] Error getPdfProxy:", error);
            res.status(500).send("No se pudo cargar el archivo");
        }
    },

    getByProvider: async (req, res) => {
        const { providerId } = req.params;
        if (!providerId) return res.status(400).json({ error: "Missing providerId" });

        try {
            console.log(`\n=======================================`);
            console.log(`🛡️ [VIGÍA DE DATOS - BACKEND] Extracción de Facturas`);
            console.log(`- Query Ejecutado: SELECT * FROM facturas_raw WHERE proveedor_id = '${providerId}'`);
            
            const { data, error } = await supabase
                .from('facturas_raw')
                .select('*')
                .eq('proveedor_id', providerId);

            if (error) throw error;

            console.log(`- Total de Registros Obtenidos: ${data ? data.length : 0}`);
            
            // Analizar la distribución de estados
            const estados = data ? data.map(f => f.status_conciliacion) : [];
            const conteoEstados = estados.reduce((acc, curr) => {
                const estadoStr = curr === null ? 'NULL' : curr;
                acc[estadoStr] = (acc[estadoStr] || 0) + 1;
                return acc;
            }, {});
            
            console.log(`- Distribución de estados (status_conciliacion):`, conteoEstados);
            console.log(`=======================================\n`);

            return res.json({ success: true, data: data || [] });
        } catch (error) {
            console.error("[FacturasController] Error getByProvider:", error);
            res.status(500).json({ error: error.message });
        }
    },

    getById: async (req, res) => {
        const { id } = req.params;
        if (!id) return res.status(400).json({ error: "Missing factura id" });

        try {
            const { data, error } = await supabase
                .from('facturas_raw')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            return res.json({ success: true, data });
        } catch (error) {
            console.error("[FacturasController] Error getById:", error);
            res.status(500).json({ error: error.message });
        }
    },

    matchFactura: async (req, res) => {
        const { id } = req.params; // factura_id
        const { recepcionId, recepcionesIds, confirm } = req.body;

        let idsToProcess = [];
        if (recepcionesIds && Array.isArray(recepcionesIds)) {
            idsToProcess = recepcionesIds;
        } else if (recepcionId) {
            idsToProcess = [recepcionId];
        }

        if (idsToProcess.length === 0) return res.status(400).json({ error: "Missing recepcionesIds" });

        try {
            // 1. Obtener la Factura
            const { data: factura, error: errFact } = await supabase
                .from('facturas_raw')
                .select('*')
                .eq('id', id)
                .single();
            if (errFact || !factura) throw new Error("Factura no encontrada");

            // 2. Obtener las Recepciones Físicas (Múltiples para Integración)
            const { data: recepciones, error: errRecCab } = await supabase
                .from('recepciones_fisicas_cabecera')
                .select('*')
                .in('id', idsToProcess);
            if (errRecCab || !recepciones || recepciones.length === 0) throw new Error("Recepción no encontrada");

            // Extraer los pedidos únicos involucrados
            const pedidosIdsUnicos = [...new Set(recepciones.map(r => r.pedido_id))];

            // 3. Obtener los Items de todos los Pedidos B2B Involucrados
            const { data: pedidoItems, error: errPedItems } = await supabase
                .from('pedidos_b2b_items')
                .select('*')
                .in('pedido_id', pedidosIdsUnicos);
            if (errPedItems) throw errPedItems;

            // 4. Obtener las Recepciones Físicas de TODOS los remitos en este grupo
            const { data: recepcionesItems, error: errRec } = await supabase
                .from('recepciones_fisicas_items')
                .select('pedido_item_id, cantidad_recibida')
                .in('recepcion_id', idsToProcess);
            if (errRec) throw errRec;

            // Agrupar cantidades recibidas consolidadas
            const recibidosMap = {};
            if (recepcionesItems && recepcionesItems.length > 0) {
                for (const rec of recepcionesItems) {
                    recibidosMap[rec.pedido_item_id] = (recibidosMap[rec.pedido_item_id] || 0) + parseFloat(rec.cantidad_recibida || 0);
                }
            }

            // 4b. Obtener el Catálogo Maestro del Proveedor para Extraer Factores de Conversión
            const { data: masterData, error: errMaster } = await supabase
                .from('tabla_maestra_operativa')
                .select('datos_maestros')
                .eq('proveedor_id', factura.proveedor_id);

            const masterCatalogMap = new Map();
            if (!errMaster && masterData) {
                masterData.forEach(row => {
                    const dm = row.datos_maestros || {};
                    // Buscamos heurísticamente el código
                    let codigo = dm.codigo || dm['código'] || dm.sku || dm.SKU;
                    if (!codigo) {
                        for (let k in dm) {
                            if (k.toLowerCase().includes('codigo') || k.toLowerCase().includes('código')) {
                                codigo = dm[k]; break;
                            }
                        }
                    }
                    if (codigo) {
                        // Cálculo exacto del factor de conversión (cant_bult * cant_valor)
                        let factor = 1;
                        let cantBult = 1;
                        let cantValor = 1;

                        // 1. Buscar cant_bult
                        const keyBult = Object.keys(dm).find(k => k.toLowerCase() === 'cant_bult' || k.toLowerCase() === 'cant_bulto');
                        if (keyBult) {
                            const valStr = String(dm[keyBult]).replace(',', '.');
                            const val = parseFloat(valStr);
                            if (!isNaN(val) && val > 0) cantBult = val;
                        }

                        // 2. Buscar cant_valor
                        const keyValor = Object.keys(dm).find(k => k.toLowerCase() === 'cant_valor' || k.toLowerCase() === 'cant_unidad');
                        if (keyValor) {
                            const valStr = String(dm[keyValor]).replace(',', '.');
                            const val = parseFloat(valStr);
                            if (!isNaN(val) && val > 0) cantValor = val;
                        }

                        factor = cantBult * cantValor;

                        // Si no hay cant_bult ni cant_valor, fallback heurístico por si otro proveedor usa 'presentacion'
                        if (factor === 1) {
                            for (let k in dm) {
                                const kt = k.toLowerCase();
                                if (kt.includes('dun') || kt.includes('ean') || kt.includes('codigo') || kt.includes('barras')) {
                                    continue;
                                }
                                if (kt.includes('presentacion') || kt.includes('presentación') || kt === 'peso') {
                                    const valStr = String(dm[k]).replace(',', '.');
                                    const val = parseFloat(valStr);
                                    if (!isNaN(val) && val > 0) {
                                        factor = val;
                                        break;
                                    }
                                }
                            }
                        }

                        masterCatalogMap.set(String(codigo).trim().toLowerCase(), factor);
                    }
                });
            }

            // 5. MOTOR DE MATCHMAKING
            let totalDesvios = 0;
            const matchReport = [];
            const articulosFactura = factura.articulos || [];

            for (const artFactura of articulosFactura) {
                const codigoF = (artFactura.codigo || '').toLowerCase().trim();
                const descF = (artFactura.descripcion || '').toLowerCase().trim();
                const cantF = parseFloat(artFactura.cantidad || 0);
                const precioF = parseFloat(artFactura.precio_unitario || 0);

                // Find matching item in Pedido
                // Strategy: exact match by code, or fallback to token overlap heuristic
                let match = pedidoItems.find(pi => !pi._matched && (pi.producto_codigo || '').toLowerCase().trim() === codigoF && codigoF !== '');
                
                if (!match) {
                    let bestScore = 0;
                    let bestCandidate = null;
                    
                    for (const pi of pedidoItems) {
                        if (pi._matched) continue;
                        const piDesc = (pi.producto_descripcion || '').toLowerCase().trim();
                        if (piDesc === descF) {
                            bestCandidate = pi;
                            bestScore = 2.0;
                            break;
                        }
                        
                        let score = calculateSimilarityScore(descF, piDesc);
                        
                        // Heurística Financiera: Si el nombre es razonablemente similar, 
                        // priorizar un match matemático exacto del precio unitario para romper empates léxicos (Ej: Variante "A" vs "AA")
                        const piPrice = parseFloat(pi.valor_unitario_ref || 0);
                        if (score >= 0.5 && piPrice > 0 && precioF > 0) {
                            if (Math.abs(piPrice - precioF) < 2.0) {
                                score += 0.5; // Fuerte bonificación (+50%)
                            }
                        }
                        
                        console.log(`[VIGÍA MATCHMAKING] Comparando: [Factura] "${descF}" vs [Pedido] "${piDesc}" -> Score Base+Precio: ${score.toFixed(2)}`);
                        
                        if (score > bestScore) {
                            bestScore = score;
                            bestCandidate = pi;
                        }
                    }
                    
                    if (bestScore >= 0.6) {
                        match = bestCandidate;
                    }
                }

                if (!match) {
                    // Item facturado no está en el pedido
                    totalDesvios++;
                    matchReport.push({
                        status: 'ERROR_NO_MATCH',
                        factura: artFactura,
                        pedido: null,
                        recibido: 0,
                        mensaje: "Artículo facturado no existe en el Pedido.",
                        desvios: ["Artículo facturado no existe en el Pedido."]
                    });
                    continue;
                }

                match._matched = true; // Sacar el ítem del pool para evitar robos de identidad

                const cantR = recibidosMap[match.id] || 0;
                let precioP = parseFloat(match.valor_unitario_ref || 0);

                // 5b. Normalización Matemática Inteligente
                const matchCodigo = String(match.producto_codigo || '').trim().toLowerCase();
                const factorConversion = masterCatalogMap.get(matchCodigo) || 1;
                
                let normalizedCantR = cantR;
                let normalizedPrecioP = precioP;
                
                // Variables que mutan si aplicamos una regla inversa para que la resta del Delta 1a1 tenga éxito
                let finalCantF = cantF;
                let finalPrecioF = precioF;

                // 1. INTENTO DE REGLA DETERMINISTA (AISLADA POR PROVEEDOR)
                let isAsymmetricUnit = false;
                
                // Obtenemos un identificador del proveedor. Para este ejemplo, usamos su nombre si está disponible,
                // o pasamos el provider_id. Aquí tenemos factura.proveedor_id, pero no tenemos el nombre cargado.
                // Sin embargo, podemos usar el ID si lo registramos en las reglas, o pasar "PUEBLO VIEJO" manual si es el caso.
                // Extraemos nombre del proveedor si vino del payload (ej. req.body no tiene nombre), o cruzamos.
                // Como workaround, si `factura.proveedor_id` matchea, usamos ese ID. Pero para escalabilidad, el motor usa `proveedor_id`.
                const ruleResult = applyConciliationRule(factura.proveedor_id, match, artFactura, factorConversion, cantR, precioP);
                
                if (ruleResult) {
                    // La regla aislada aplicó con éxito (ej. PUEBLO_VIEJO)
                    normalizedCantR = ruleResult.normalizedCantR;
                    normalizedPrecioP = ruleResult.normalizedPrecioP;
                    
                    if (ruleResult.overrideCantF !== undefined) finalCantF = ruleResult.overrideCantF;
                    if (ruleResult.overridePrecioF !== undefined) finalPrecioF = ruleResult.overridePrecioF;
                    
                    isAsymmetricUnit = true;
                    console.log(`[VIGÍA MATEMÁTICO] Regla Aislada Aplicada: ${ruleResult.ruleName}`);
                } else {
                    // 2. FALLBACK A HEURÍSTICA GENERAL (Mantiene el sistema legado a salvo)
                    const ratioQty = cantR > 0 ? cantF / cantR : 0;
                    const ratioPrice = precioF > 0 ? precioP / precioF : 0;
                    
                    if (ratioQty > 1.2 && ratioPrice > 1.2 && Math.abs(ratioQty - ratioPrice) / ratioPrice < 0.20) {
                        isAsymmetricUnit = true;
                    } else if (factorConversion > 1.1 && ratioQty >= factorConversion * 0.8 && ratioQty <= factorConversion * 1.2) {
                        isAsymmetricUnit = true;
                    }

                    if (isAsymmetricUnit) {
                        const factorToUse = factorConversion > 1.1 ? factorConversion : ratioPrice;
                        normalizedCantR = cantR * factorToUse;
                        // normalizedPrecioP se mantiene intacto = precioP
                    }
                }

                console.log(`\n======================================================`);
                console.log(`[VIGÍA MATEMÁTICO] Estado Pre-Delta para Artículo: ${descF}`);
                console.log(`- Factura: CantF=${finalCantF}, PrecioF=${finalPrecioF} (Originales: ${cantF}, ${precioF})`);
                console.log(`- Pedido (Crudo): CantR=${cantR}, PrecioP=${precioP}, factorConversion=${factorConversion}`);
                console.log(`- Asimetría Detectada: ${isAsymmetricUnit}`);
                console.log(`- Pedido (Normalizado): normalizedCantR=${normalizedCantR}, normalizedPrecioP=${normalizedPrecioP}`);
                console.log(`======================================================\n`);

                // Cálculo de Deltas
                const deltaMonto = parseFloat((finalPrecioF - normalizedPrecioP).toFixed(2));
                let deltaPorcentaje = 0;
                if (normalizedPrecioP > 0) {
                    deltaPorcentaje = parseFloat(((deltaMonto / normalizedPrecioP) * 100).toFixed(2));
                }

                const desvios = [];
                // Faltante Físico: Tolerancia de 3% para variaciones de peso (catch-weight)
                if (finalCantF > normalizedCantR * 1.03) {
                    desvios.push(`Faltante Físico: Cobran ${finalCantF.toFixed(2)} pero se recibió el equivalente a ${normalizedCantR.toFixed(2)}`);
                }
                
                // Desvío Precio: Tolerancia financiera de $5.00
                if (Math.abs(deltaMonto) > 5.0) {
                    desvios.push(`Desvío Precio: Facturado a $${finalPrecioF.toFixed(2)} (Pactado Equiv: $${normalizedPrecioP.toFixed(2)})`);
                }

                if (desvios.length > 0) totalDesvios++;

                matchReport.push({
                    status: desvios.length > 0 ? 'DESVIO' : 'OK',
                    factura: artFactura,
                    pedido: {
                        codigo: match.producto_codigo,
                        descripcion: match.producto_descripcion,
                        precio_unitario_base: parseFloat(match.valor_unitario_ref || 0),
                        factor_conversion: factorConversion,
                        precio_unitario: normalizedPrecioP
                    },
                    recibido: normalizedCantR, // Reportamos cantidad normalizada para no asustar en UI

                    delta_monto: deltaMonto,
                    delta_porcentaje: deltaPorcentaje,
                    desvios: desvios
                });
            }

            const unmatchedPedidoItems = pedidoItems.filter(pi => !pi._matched).map(pi => {
                const matchCodigo = String(pi.producto_codigo || '').trim().toLowerCase();
                return {
                    ...pi,
                    cantR: recibidosMap[pi.id] || 0,
                    factor_conversion: masterCatalogMap.get(matchCodigo) || 1
                };
            });

            // 6. Actualizar Factura (SÓLO SI ES HITL CONFIRMADO)
            const finalStatus = totalDesvios > 0 ? 'OBSERVADO_POR_DESVIOS' : 'CONCILIADO_OK';
            
            let updatedFact = factura;
            if (req.body.confirm === true) {
                const { data: uFact, error: updateErr } = await supabase
                    .from('facturas_raw')
                    .update({
                        pedido_b2b_id: pedidosIdsUnicos[0],
                        status_conciliacion: finalStatus,
                        match_report: matchReport
                    })
                    .eq('id', id)
                    .select()
                    .single();

                if (updateErr) throw updateErr;
                updatedFact = uFact;
            }

            return res.json({ success: true, status: finalStatus, matchReport, unmatchedPedidoItems, data: updatedFact });

        } catch (error) {
            console.error("[FacturasController] Error matchFactura:", error);
            res.status(500).json({ error: error.message });
        }
    },

    confirmarMatch: async (req, res) => {
        const { id } = req.params; // Factura ID
        const { recepcionId, recepcionesIds } = req.body;
        
        let idsToProcess = [];
        if (recepcionesIds && Array.isArray(recepcionesIds)) {
            idsToProcess = recepcionesIds;
        } else if (recepcionId) {
            idsToProcess = [recepcionId];
        }

        if (idsToProcess.length === 0) return res.status(400).json({ error: "Falta recepcionesIds" });

        try {
            console.log(`[FacturasController] Etapa 4: Confirmando Match para Factura ${id} y Recepciones ${idsToProcess.join(', ')}`);
            
            // 1. Obtener la factura para verificar estado y proveedor
            const { data: factura, error: errFactura } = await supabase
                .from('facturas_raw')
                .select('*')
                .eq('id', id)
                .single();
                
            if (errFactura || !factura) throw new Error("Factura no encontrada");
            
            if (factura.status_conciliacion !== 'PENDIENTE_MATCH' && factura.status_conciliacion !== null) {
                // Si el sistema no inicializó status_conciliacion, lo perdonamos, pero si es != PENDIENTE_MATCH y no nulo, cuidado.
                // En la migración dice DEFAULT 'PENDIENTE_MATCH'
            }

            // 2. Insertar en cuenta_corriente_proveedores la Factura principal
            const { data: cc, error: errCC } = await supabase
                .from('cuenta_corriente_proveedores')
                .insert([{
                    proveedor_id: factura.proveedor_id,
                    tipo_movimiento: 'FACTURA',
                    monto_credito: factura.importe_total || 0,
                    monto_debito: 0,
                    referencia_factura_id: factura.id,
                    observaciones: `Factura ${factura.tipo_comprobante} ${factura.punto_venta}-${factura.numero_comprobante} Conciliada`
                }])
                .select()
                .single();
                
            if (errCC) throw errCC;

            // 2.5. Cargar Diferencia a Favor si el usuario lo solicitó
            const matchReport = req.body.matchReport || factura.match_report;
            if (req.body.chargeDifference && matchReport && Array.isArray(matchReport)) {
                let diferencia = 0;
                matchReport.forEach(item => {
                    if (item.delta_monto && parseFloat(item.delta_monto) > 0) {
                        const cant = parseFloat(item.factura?.cantidad_calculada || item.factura?.cantidad || 0);
                        diferencia += (parseFloat(item.delta_monto) * cant);
                    }
                });
                
                // Solo generamos si realmente cobraron de más (diferencia positiva > 1 peso)
                if (diferencia > 1.0) {
                    const { error: errAjuste } = await supabase
                        .from('cuenta_corriente_proveedores')
                        .insert([{
                            proveedor_id: factura.proveedor_id,
                            tipo_movimiento: 'NOTA_DEBITO_INTERNA',
                            monto_credito: 0,
                            monto_debito: parseFloat(diferencia.toFixed(2)),
                            referencia_factura_id: factura.id,
                            observaciones: `Ajuste a favor por desvíos en conciliación de Factura ${factura.numero_comprobante}`
                        }]);
                    if (errAjuste) throw errAjuste;
                    console.log(`[FacturasController] Se insertó Ajuste a Favor por $${diferencia.toFixed(2)}`);
                }
            }

            // 3. Mutar las recepciones físicas para que desaparezcan de pendientes
            const { error: errRec } = await supabase
                .from('recepciones_fisicas_cabecera')
                .update({ estado_conciliacion: 'CONCILIADA' })
                .in('id', idsToProcess);
                
            if (errRec) throw errRec;

            // 4. Mutar la factura en firme
            const reportToSave = req.body.matchReport || factura.match_report || [];
            if (Array.isArray(reportToSave)) {
                if (reportToSave.length > 0) {
                    reportToSave[0]._meta_recepcionesIds = idsToProcess;
                } else {
                    reportToSave.push({ _meta_recepcionesIds: idsToProcess });
                }
            }

            const { data: uFact, error: updateErr } = await supabase
                .from('facturas_raw')
                .update({
                    status_conciliacion: 'CONCILIADO_OK',
                    cuenta_corriente_id: cc.id,
                    match_report: reportToSave
                })
                .eq('id', id)
                .select()
                .single();

            if (updateErr) throw updateErr;

            return res.json({ success: true, message: "Asiento Financiero registrado exitosamente.", data: uFact });
        } catch (error) {
            console.error("[FacturasController] Error confirmarMatch:", error);
            res.status(500).json({ error: error.message });
        }
    },

    matchFacturasMulti: async (req, res) => {
        const { facturasIds, recepcionesIds } = req.body;
        
        let idsToProcess = recepcionesIds;
        if (!idsToProcess || idsToProcess.length === 0) return res.status(400).json({ error: "Missing recepcionesIds" });
        if (!facturasIds || facturasIds.length === 0) return res.status(400).json({ error: "Missing facturasIds" });

        try {
            // 1. Obtener las Facturas
            const { data: facturas, error: errFact } = await supabase
                .from('facturas_raw')
                .select('*')
                .in('id', facturasIds);
            if (errFact || !facturas || facturas.length === 0) throw new Error("Facturas no encontradas");

            // 1b. Crear Factura Virtual Consolidada
            const virtualFactura = {
                id: facturasIds.join(','),
                proveedor_id: facturas[0].proveedor_id,
                articulos: [],
                importe_total: 0
            };

            const mergedArticulos = {};
            facturas.forEach(f => {
                virtualFactura.importe_total += parseFloat(f.importe_total || 0);
                (f.articulos || []).forEach(art => {
                    const key = art.codigo ? String(art.codigo).trim().toLowerCase() : String(art.descripcion).trim().toLowerCase();
                    if (!mergedArticulos[key]) {
                        mergedArticulos[key] = { ...art, cantidad: parseFloat(art.cantidad || 0), precio_unitario: parseFloat(art.precio_unitario || 0) };
                    } else {
                        mergedArticulos[key].cantidad += parseFloat(art.cantidad || 0);
                        // No sumamos precio_unitario, conservamos uno (el matchmaking lo tolera o usa heurísticas)
                    }
                });
            });
            virtualFactura.articulos = Object.values(mergedArticulos);

            // 2. Obtener las Recepciones Físicas
            const { data: recepciones, error: errRecCab } = await supabase
                .from('recepciones_fisicas_cabecera')
                .select('*')
                .in('id', idsToProcess);
            if (errRecCab || !recepciones || recepciones.length === 0) throw new Error("Recepción no encontrada");

            const pedidosIdsUnicos = [...new Set(recepciones.map(r => r.pedido_id))];

            // 3. Obtener Items B2B
            const { data: pedidoItems, error: errPedItems } = await supabase
                .from('pedidos_b2b_items')
                .select('*')
                .in('pedido_id', pedidosIdsUnicos);
            if (errPedItems) throw errPedItems;

            // 4. Obtener Recepciones Items
            const { data: recepcionesItems, error: errRec } = await supabase
                .from('recepciones_fisicas_items')
                .select('pedido_item_id, cantidad_recibida')
                .in('recepcion_id', idsToProcess);
            if (errRec) throw errRec;

            const recibidosMap = {};
            if (recepcionesItems && recepcionesItems.length > 0) {
                for (const rec of recepcionesItems) {
                    recibidosMap[rec.pedido_item_id] = (recibidosMap[rec.pedido_item_id] || 0) + parseFloat(rec.cantidad_recibida || 0);
                }
            }

            // 4b. Factor de Conversión
            const { data: masterData, error: errMaster } = await supabase
                .from('tabla_maestra_operativa')
                .select('datos_maestros')
                .eq('proveedor_id', virtualFactura.proveedor_id);

            const masterCatalogMap = new Map();
            if (!errMaster && masterData) {
                masterData.forEach(row => {
                    const dm = row.datos_maestros || {};
                    let codigo = dm.codigo || dm['código'] || dm.sku || dm.SKU;
                    if (!codigo) {
                        for (let k in dm) {
                            if (k.toLowerCase().includes('codigo') || k.toLowerCase().includes('código')) { codigo = dm[k]; break; }
                        }
                    }
                    if (codigo) {
                        let factor = 1; let cantBult = 1; let cantValor = 1;
                        const keyBult = Object.keys(dm).find(k => k.toLowerCase() === 'cant_bult' || k.toLowerCase() === 'cant_bulto');
                        if (keyBult) { const val = parseFloat(String(dm[keyBult]).replace(',', '.')); if (!isNaN(val) && val > 0) cantBult = val; }
                        const keyValor = Object.keys(dm).find(k => k.toLowerCase() === 'cant_valor' || k.toLowerCase() === 'cant_unidad');
                        if (keyValor) { const val = parseFloat(String(dm[keyValor]).replace(',', '.')); if (!isNaN(val) && val > 0) cantValor = val; }
                        factor = cantBult * cantValor;
                        if (factor === 1) {
                            for (let k in dm) {
                                const kt = k.toLowerCase();
                                if (kt.includes('dun') || kt.includes('ean') || kt.includes('codigo') || kt.includes('barras')) continue;
                                if (kt.includes('presentacion') || kt.includes('presentación') || kt === 'peso') {
                                    const val = parseFloat(String(dm[k]).replace(',', '.'));
                                    if (!isNaN(val) && val > 0) { factor = val; break; }
                                }
                            }
                        }
                        masterCatalogMap.set(String(codigo).trim().toLowerCase(), factor);
                    }
                });
            }

            // 5. MOTOR MATCHMAKING (Virtual Factura vs Recepcion)
            let totalDesvios = 0;
            const matchReport = [];
            function normalizeString(str) {
                if (!str) return '';
                return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            }

            function calculateSimilarityScore(s1, s2) {
                if (!s1 || !s2) return 0;
                s1 = normalizeString(s1);
                s2 = normalizeString(s2);
                
                // Extraemos palabras mayores a 2 caracteres y eliminamos puntuación pegada
                const extractWords = str => str.replace(/[.,()]/g, '').split(' ').filter(w => w.length > 2);
                const words1 = extractWords(s1);
                const words2 = extractWords(s2);
                
                if (words1.length === 0 || words2.length === 0) return 0;

                const shortest = words1.length < words2.length ? words1 : words2;
                const longest = words1.length < words2.length ? words2 : words1;

                let matches = 0;
                for (const wShort of shortest) {
                    if (longest.some(wLong => wLong === wShort || wLong.includes(wShort) || wShort.includes(wLong))) {
                        matches++;
                    }
                }
                
                return matches / shortest.length;
            }
            
            function applyConciliationRule(proveedorId, pedidoItem, facturaItem, masterFactorConversion, cantidadRecibida, precioPedido) {
                // ... same isolated rule fallback logic
                return null; // Simplificado para que use la heurística general
            }

            console.log("\n================ [VIGÍA DE MATCHING - INICIO] ================");
            console.log("Total Artículos en Factura Virtual:", virtualFactura.articulos.length);
            console.log("Total Items Disponibles en Pedidos B2B:", pedidoItems.length);

            for (const artFactura of virtualFactura.articulos) {
                const codigoF = (artFactura.codigo || '').toLowerCase().trim();
                const descF = (artFactura.descripcion || '').toLowerCase().trim();
                const cantF = parseFloat(artFactura.cantidad || 0);
                const precioF = parseFloat(artFactura.precio_unitario || 0);

                console.log(`\n🔹 Evaluando Factura Ítem -> Cód: [${codigoF}] | Desc: [${descF}]`);

                let match = pedidoItems.find(pi => !pi._matched && (pi.producto_codigo || '').toLowerCase().trim() === codigoF && codigoF !== '');
                
                if (match) {
                    console.log(`   ✅ MATCH EXACTO POR CÓDIGO: [${match.producto_codigo}]`);
                } else {
                    console.log(`   ⚠️ NO hay match por código. Iniciando Búsqueda Semántica (Fallback)...`);
                    let bestScore = 0; let bestCandidate = null;
                    for (const pi of pedidoItems) {
                        if (pi._matched) continue;
                        const piDesc = (pi.producto_descripcion || '').toLowerCase().trim();
                        if (piDesc === descF) { 
                            bestCandidate = pi; 
                            bestScore = 1.0; 
                            console.log(`      🎯 MATCH EXACTO POR DESCRIPCIÓN: [${piDesc}]`);
                            break; 
                        }
                        const score = calculateSimilarityScore(descF, piDesc);
                        console.log(`      🔎 Comparando: [${descF}] vs [${piDesc}] => Score: ${score.toFixed(2)}`);
                        if (score > bestScore) { bestScore = score; bestCandidate = pi; }
                    }
                    console.log(`   🏆 Mejor Candidato Semántico: [${bestCandidate ? bestCandidate.producto_descripcion : 'NINGUNO'}] (Score Final: ${bestScore.toFixed(2)})`);
                    if (bestScore >= 0.6) {
                        match = bestCandidate;
                        console.log(`   ✅ MATCH SEMÁNTICO ACEPTADO (Score >= 0.6)`);
                    } else {
                        console.log(`   ❌ MATCH SEMÁNTICO RECHAZADO (Score < 0.6)`);
                    }
                }

                if (!match) {
                    totalDesvios++;
                    matchReport.push({ status: 'ERROR_NO_MATCH', factura: artFactura, pedido: null, recibido: 0, mensaje: "Artículo facturado no existe en el Pedido.", desvios: ["Artículo facturado no existe en el Pedido."] });
                    continue;
                }

                match._matched = true;
                const cantR = recibidosMap[match.id] || 0;
                let precioP = parseFloat(match.valor_unitario_ref || 0);
                const matchCodigo = String(match.producto_codigo || '').trim().toLowerCase();
                const factorConversion = masterCatalogMap.get(matchCodigo) || 1;
                
                let normalizedCantR = cantR;
                let finalCantF = cantF;
                let finalPrecioF = precioF;

                const ratioQty = cantR > 0 ? cantF / cantR : 0;
                const ratioPrice = precioF > 0 ? precioP / precioF : 0;
                let isAsymmetricUnit = false;
                
                if (ratioQty > 1.2 && ratioPrice > 1.2 && Math.abs(ratioQty - ratioPrice) / ratioPrice < 0.20) {
                    isAsymmetricUnit = true;
                } else if (factorConversion > 1.1 && ratioQty >= factorConversion * 0.8 && ratioQty <= factorConversion * 1.2) {
                    isAsymmetricUnit = true;
                }

                if (isAsymmetricUnit) {
                    const factorToUse = factorConversion > 1.1 ? factorConversion : ratioPrice;
                    normalizedCantR = cantR * factorToUse;
                }

                let cantDelta = finalCantF - normalizedCantR;
                let precioDelta = finalPrecioF - precioP;
                const desviosLocales = [];
                if (cantDelta > 0) { desviosLocales.push(`Faltante Físico: Facturado ${finalCantF}, Recibido ${normalizedCantR}`); totalDesvios++; }
                else if (cantDelta < 0) desviosLocales.push(`Sobrante Físico: Facturado ${finalCantF}, Recibido ${normalizedCantR}`);

                const rowReport = {
                    status: desviosLocales.length > 0 ? 'OBSERVADO' : 'OK',
                    factura: artFactura,
                    pedido: { ...match, precio_unitario: precioP, factor_conversion: factorConversion },
                    recibido: cantR,
                    normalizedCantR: normalizedCantR,
                    delta_cantidad: cantDelta,
                    delta_monto: precioDelta,
                    delta_porcentaje: (precioP > 0) ? ((precioDelta / precioP) * 100).toFixed(2) : 0,
                    desvios: desviosLocales
                };
                matchReport.push(rowReport);
            }

            const unmatchedPedidoItems = pedidoItems.filter(pi => !pi._matched).map(pi => {
                const matchCodigo = String(pi.producto_codigo || '').trim().toLowerCase();
                return {
                    ...pi,
                    cantR: recibidosMap[pi.id] || 0,
                    factor_conversion: masterCatalogMap.get(matchCodigo) || 1
                };
            });

            if (req.body.confirm === true) {
                // Update las facturas
                const { error: updErr } = await supabase.from('facturas_raw')
                    .update({ status_conciliacion: 'OBSERVADO_POR_DESVIOS', match_report: matchReport })
                    .in('id', facturasIds);
                if (updErr) throw updErr;
            }

            return res.json({ success: true, matchReport, unmatchedPedidoItems, isMulti: true });

        } catch (error) {
            console.error("[FacturasController] Error matchFacturasMulti:", error);
            res.status(500).json({ error: error.message });
        }
    },

    confirmarMatchMulti: async (req, res) => {
        const { facturasIds, recepcionesIds, matchReport, chargeDifference } = req.body;
        
        if (!facturasIds || facturasIds.length === 0) return res.status(400).json({ error: "Missing facturasIds" });
        if (!recepcionesIds || recepcionesIds.length === 0) return res.status(400).json({ error: "Missing recepcionesIds" });

        try {
            // 1. Obtener Facturas Reales
            const { data: facturas, error: errFact } = await supabase.from('facturas_raw').select('*').in('id', facturasIds);
            if (errFact || !facturas) throw new Error("Facturas no encontradas");

            const proveedorId = facturas[0].proveedor_id;
            
            // 2. Transaccionar CC Individualmente
            const ccPayloads = facturas.map(f => ({
                proveedor_id: f.proveedor_id,
                tipo_movimiento: 'FACTURA',
                monto_credito: f.importe_total || 0,
                monto_debito: 0,
                referencia_factura_id: f.id,
                observaciones: `Factura Agrupada ${f.tipo_comprobante} ${f.punto_venta}-${f.numero_comprobante} Conciliada (N:1)`
            }));

            const { data: ccData, error: errCC } = await supabase.from('cuenta_corriente_proveedores').insert(ccPayloads).select();
            if (errCC) throw errCC;

            // Diferencia a Favor
            if (chargeDifference && matchReport && Array.isArray(matchReport)) {
                let diferencia = 0;
                matchReport.forEach(item => {
                    if (item.delta_monto && parseFloat(item.delta_monto) > 0) {
                        const cant = parseFloat(item.factura?.cantidad_calculada || item.factura?.cantidad || 0);
                        diferencia += (parseFloat(item.delta_monto) * cant);
                    }
                });
                
                if (diferencia > 1.0) {
                    const { error: errAjuste } = await supabase.from('cuenta_corriente_proveedores')
                        .insert([{
                            proveedor_id: proveedorId,
                            tipo_movimiento: 'NOTA_DEBITO_INTERNA',
                            monto_credito: 0,
                            monto_debito: parseFloat(diferencia.toFixed(2)),
                            referencia_factura_id: facturas[0].id, // Asociada a la primera para trazabilidad
                            observaciones: `Ajuste a favor por desvíos en conciliación N:1 Lote`
                        }]);
                    if (errAjuste) throw errAjuste;
                }
            }

            // 3. Mutar las recepciones físicas (CABECERA)
            const { error: errRec } = await supabase.from('recepciones_fisicas_cabecera')
                .update({ estado_conciliacion: 'CONCILIADA' })
                .in('id', recepcionesIds);
            if (errRec) throw errRec;

            // 4. Mutar las facturas en firme
            const idsUpdated = [];
            
            const reportToSave = matchReport || [];
            if (Array.isArray(reportToSave)) {
                if (reportToSave.length > 0) {
                    reportToSave[0]._meta_recepcionesIds = recepcionesIds;
                } else {
                    reportToSave.push({ _meta_recepcionesIds: recepcionesIds });
                }
            }

            for (let i = 0; i < facturas.length; i++) {
                const f = facturas[i];
                const ccMatched = ccData.find(c => c.referencia_factura_id === f.id);
                const { error: updateErr } = await supabase.from('facturas_raw')
                    .update({ status_conciliacion: 'CONCILIADO_OK', cuenta_corriente_id: ccMatched ? ccMatched.id : null, match_report: reportToSave })
                    .eq('id', f.id);
                if (updateErr) throw updateErr;
                idsUpdated.push(f.id);
            }

            return res.json({ success: true, message: "Asiento Financiero Múltiple registrado exitosamente.", ids: idsUpdated });
        } catch (error) {
            console.error("[FacturasController] Error confirmarMatchMulti:", error);
            res.status(500).json({ error: error.message });
        }
    },

    deshacerConciliacion: async (req, res) => {
        const { id } = req.params;

        try {
            console.log(`[FacturasController] Rollback de Conciliación para Factura ${id}`);

            // 1. Obtener la Factura
            const { data: factura, error: errFactura } = await supabase
                .from('facturas_raw')
                .select('*')
                .eq('id', id)
                .single();

            if (errFactura || !factura) throw new Error("Factura no encontrada");

            // 2. Extraer Recepciones vinculadas
            let recepcionesIds = [];
            if (Array.isArray(factura.match_report) && factura.match_report.length > 0) {
                // Recorremos todos los elementos del match_report por si el _meta está en otro índice
                factura.match_report.forEach(item => {
                    if (item && item._meta_recepcionesIds && Array.isArray(item._meta_recepcionesIds)) {
                        item._meta_recepcionesIds.forEach(id => {
                            if (!recepcionesIds.includes(id)) recepcionesIds.push(id);
                        });
                    }
                });
                
                // Si no se encontró el meta de forma directa, intentamos buscar por los ítems del pedido (ingeniería inversa)
                if (recepcionesIds.length === 0) {
                    const pedidoItemIds = factura.match_report
                        .filter(item => item && item.pedido && item.pedido.id)
                        .map(item => item.pedido.id);
                        
                    if (pedidoItemIds.length > 0) {
                        const { data: recItems } = await supabase.from('recepciones_fisicas_items')
                            .select('recepcion_id')
                            .in('pedido_item_id', pedidoItemIds);
                            
                        if (recItems && recItems.length > 0) {
                            recItems.forEach(ri => {
                                if (!recepcionesIds.includes(ri.recepcion_id)) recepcionesIds.push(ri.recepcion_id);
                            });
                        }
                    }
                }
            }

            // Fallback heurístico para facturas viejas / incompletas (Aislado por Proveedor de forma estricta)
            if (recepcionesIds.length === 0) {
                console.log(`[VIGÍA] No se encontraron recepciones explícitas para la factura ${id}. Aplicando fallback de último recurso por proveedor...`);
                // Obtener los pedidos B2B del proveedor
                const { data: pedidosProv } = await supabase.from('pedidos_b2b_cabecera')
                    .select('id')
                    .eq('proveedor_id', factura.proveedor_id);

                if (pedidosProv && pedidosProv.length > 0) {
                    const idsPedidos = pedidosProv.map(p => p.id);
                    const { data: recViejas } = await supabase.from('recepciones_fisicas_cabecera')
                        .select('id, numero_remito')
                        .in('pedido_id', idsPedidos)
                        .eq('estado_conciliacion', 'CONCILIADA')
                        .order('created_at', { ascending: false })
                        .limit(1);
                    
                    if (recViejas && recViejas.length > 0) {
                        const remito = recViejas[0].numero_remito;
                        if (remito) {
                            // Liberar todo el lote (ej. MULTI-12345)
                            const { data: lote } = await supabase.from('recepciones_fisicas_cabecera')
                                .select('id')
                                .in('pedido_id', idsPedidos)
                                .eq('estado_conciliacion', 'CONCILIADA')
                                .eq('numero_remito', remito);
                            recepcionesIds = lote.map(r => r.id);
                        } else {
                            recepcionesIds = [recViejas[0].id];
                        }
                    } else {
                        console.warn(`[VIGÍA] No se encontraron recepciones FÍSICAS conciliadas para el proveedor ${factura.proveedor_id}.`);
                    }
                } else {
                    console.warn(`[VIGÍA] Proveedor ${factura.proveedor_id} no tiene pedidos B2B.`);
                }
            }

            // 3. Eliminar Asientos Financieros
            // Al borrar todos los de esa referencia, se borran tanto FACTURA como NOTA_DEBITO_INTERNA (sobreprecios)
            const { error: errDeleteCC } = await supabase
                .from('cuenta_corriente_proveedores')
                .delete()
                .eq('referencia_factura_id', id);

            if (errDeleteCC) throw errDeleteCC;

            // 4. Liberar Recepción Logística
            if (recepcionesIds.length > 0) {
                const { error: errRec } = await supabase
                    .from('recepciones_fisicas_cabecera')
                    .update({ estado_conciliacion: 'NO_CONCILIADA' })
                    .in('id', recepcionesIds);
                if (errRec) throw errRec;
            }

            // 5. Restablecer Factura
            const { error: updateErr } = await supabase
                .from('facturas_raw')
                .update({
                    status_conciliacion: 'PENDIENTE_MATCH',
                    cuenta_corriente_id: null,
                    match_report: null
                })
                .eq('id', id);

            if (updateErr) throw updateErr;

            return res.json({ success: true, message: "Conciliación revertida exitosamente." });

        } catch (error) {
            console.error("[FacturasController] Error en deshacerConciliacion:", error);
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = facturasController;
