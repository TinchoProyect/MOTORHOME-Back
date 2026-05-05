const aiService = require('../services/aiService');
const driveService = require('../services/driveService');
const { applyBillingRule } = require('../services/billingRules');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

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
            const mimeType = 'application/pdf'; // Etapa 1/2 asume PDF
            
            // Construimos el Data URI esperado por el Motor Chofer
            const dataUrl = `data:${mimeType};base64,${base64Data}`;
            
            let intentos = 0;
            const MAX_INTENTOS = 3;
            let saneamientoJson = null;

            while (intentos < MAX_INTENTOS) {
                intentos++;
                console.log(`[FacturasController] Extracción IA (Intento ${intentos}/${MAX_INTENTOS})...`);
                
                try {
                    const extractedJson = await aiService.executeInvoiceExtraction(dataUrl, mimeType);
                    
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
        try {
            console.log(`[FacturasController] Sirviendo PDF por Proxy para bypass CSP: ${fileId}`);
            const buffer = await driveService.downloadFileToBuffer(fileId);
            
            res.setHeader('Content-Type', 'application/pdf');
            // 'inline' permite que el navegador lo renderice en el iframe en lugar de descargarlo
            res.setHeader('Content-Disposition', `inline; filename="factura_${fileId}.pdf"`);
            
            res.send(buffer);
        } catch (error) {
            console.error("[FacturasController] Error getPdfProxy:", error);
            res.status(500).send("No se pudo cargar el PDF");
        }
    },

    getByProvider: async (req, res) => {
        const { providerId } = req.params;
        if (!providerId) return res.status(400).json({ error: "Missing providerId" });

        try {
            const { data, error } = await supabase
                .from('facturas_raw')
                .select('*')
                .eq('proveedor_id', providerId);

            if (error) throw error;

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
        const { recepcionId, confirm } = req.body;

        if (!recepcionId) return res.status(400).json({ error: "Missing recepcionId" });

        try {
            // 1. Obtener la Factura
            const { data: factura, error: errFact } = await supabase
                .from('facturas_raw')
                .select('*')
                .eq('id', id)
                .single();
            if (errFact || !factura) throw new Error("Factura no encontrada");

            // 2. Obtener la Recepción Física
            const { data: recepcion, error: errRecCab } = await supabase
                .from('recepciones_fisicas_cabecera')
                .select('*')
                .eq('id', recepcionId)
                .single();
            if (errRecCab || !recepcion) throw new Error("Recepción no encontrada");

            const pedidoId = recepcion.pedido_id;

            // 2b. Obtener el Pedido B2B
            const { data: pedido, error: errPed } = await supabase
                .from('pedidos_b2b_cabecera')
                .select('*')
                .eq('id', pedidoId)
                .single();
            if (errPed || !pedido) throw new Error("Pedido B2B no encontrado");

            // 3. Obtener los Items del Pedido
            const { data: pedidoItems, error: errPedItems } = await supabase
                .from('pedidos_b2b_items')
                .select('*')
                .eq('pedido_id', pedidoId);
            if (errPedItems) throw errPedItems;

            // 4. Obtener las Recepciones Físicas SOLO de esta recepción
            const { data: recepcionesItems, error: errRec } = await supabase
                .from('recepciones_fisicas_items')
                .select('pedido_item_id, cantidad_recibida')
                .eq('recepcion_id', recepcionId);
            if (errRec) throw errRec;

            // Agrupar cantidades recibidas (en este remito específico)
            const recibidosMap = {};
            if (recepcionesItems && recepcionesItems.length > 0) {
                for (const rec of recepcionesItems) {
                    recibidosMap[rec.pedido_item_id] = (recibidosMap[rec.pedido_item_id] || 0) + parseFloat(rec.cantidad_recibida || 0);
                }
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
                // Strategy: exact match by code, or fallback to description contains
                let match = pedidoItems.find(pi => (pi.producto_codigo || '').toLowerCase().trim() === codigoF && codigoF !== '');
                if (!match) {
                    match = pedidoItems.find(pi => 
                        (descF.length > 3 && (pi.producto_descripcion || '').toLowerCase().trim().includes(descF)) || 
                        ((pi.producto_descripcion || '').length > 3 && descF.includes((pi.producto_descripcion || '').toLowerCase().trim()))
                    );
                }

                if (!match) {
                    // Item facturado no está en el pedido
                    totalDesvios++;
                    matchReport.push({
                        status: 'ERROR_NO_MATCH',
                        factura: artFactura,
                        pedido: null,
                        recibido: 0,
                        mensaje: "Artículo facturado no existe en el Pedido."
                    });
                    continue;
                }

                const cantR = recibidosMap[match.id] || 0;
                const precioP = parseFloat(match.valor_unitario_ref || 0);

                const desvios = [];
                if (cantF > cantR) desvios.push(`Faltante Físico: Cobran ${cantF} pero se recibió ${cantR}`);
                if (precioF > precioP) desvios.push(`Desvío Precio: Facturado a $${precioF} (Pactado: $${precioP})`);

                if (desvios.length > 0) totalDesvios++;

                matchReport.push({
                    status: desvios.length > 0 ? 'DESVIO' : 'OK',
                    factura: artFactura,
                    pedido: {
                        codigo: match.producto_codigo,
                        descripcion: match.producto_descripcion,
                        precio_unitario: precioP
                    },
                    recibido: cantR,
                    desvios: desvios
                });
            }

            // 6. Actualizar Factura (SÓLO SI ES HITL CONFIRMADO)
            const finalStatus = totalDesvios > 0 ? 'OBSERVADO_POR_DESVIOS' : 'CONCILIADO_OK';
            
            let updatedFact = factura;
            if (req.body.confirm === true) {
                const { data: uFact, error: updateErr } = await supabase
                    .from('facturas_raw')
                    .update({
                        pedido_b2b_id: pedidoId,
                        status_conciliacion: finalStatus,
                        match_report: matchReport
                    })
                    .eq('id', id)
                    .select()
                    .single();

                if (updateErr) throw updateErr;
                updatedFact = uFact;
            }

            return res.json({ success: true, status: finalStatus, matchReport, data: updatedFact });

        } catch (error) {
            console.error("[FacturasController] Error matchFactura:", error);
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = facturasController;
