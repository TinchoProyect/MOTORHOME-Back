const aiService = require('../services/aiService');
const driveService = require('../services/driveService');
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
            const extractedJson = await aiService.executeInvoiceExtraction(dataUrl, mimeType);

            // 4. Save or Update Database
            const newRecord = {
                proveedor_id: providerId,
                archivo_id: fileId,
                archivo_nombre: fileName,
                status: 'PENDIENTE',
                cuit_emisor: extractedJson.cuit_emisor || null,
                punto_venta: extractedJson.punto_venta || null,
                numero_comprobante: extractedJson.numero_comprobante || null,
                tipo_comprobante: extractedJson.tipo_comprobante || null,
                fecha_emision: extractedJson.fecha_emision || null,
                fecha_vto_cae: extractedJson.fecha_vto_cae || null,
                cae: extractedJson.cae || null,
                importe_neto_gravado: extractedJson.importe_neto_gravado || 0,
                importe_iva_21: extractedJson.importe_iva_21 || 0,
                importe_iva_105: extractedJson.importe_iva_105 || 0,
                importe_iva_27: extractedJson.importe_iva_27 || 0,
                percepciones_iibb: extractedJson.percepciones_iibb || 0,
                percepciones_iva: extractedJson.percepciones_iva || 0,
                conceptos_no_gravados: extractedJson.conceptos_no_gravados || 0,
                importe_total: extractedJson.importe_total || 0,
                articulos: extractedJson.articulos || [],
                datos_extraidos: extractedJson
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
    }
};

module.exports = facturasController;
