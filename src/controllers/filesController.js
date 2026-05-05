const driveService = require('../services/driveService');
const extractionService = require('../services/extractionService');
const supabase = require('../config/supabaseClient');
// AGREGADO: Importamos el servicio de huellas digitales
const fingerprintService = require('../services/fingerprintService');
const ingestService = require('../services/ingestService');

const DEFAULT_FOLDER_ID = process.env.DRIVE_FOLDER_ID;

// =============================================================================
// LIST FILES
// =============================================================================
async function listFiles(req, res) {
    try {
        const folderId = req.query.folderId || DEFAULT_FOLDER_ID;
        if (!folderId) {
            return res.status(400).json({ error: "Falta Folder ID (Verificar .env o query param)" });
        }

        console.log(`[FilesController] Listando archivos de: ${folderId} (Type: ${req.query.type || 'all'})`);

        let mimeType = null;
        if (req.query.type === 'folders') {
            mimeType = 'application/vnd.google-apps.folder';
        }

        const files = await driveService.listFiles(folderId, mimeType);

        res.json({
            success: true,
            count: files.length,
            files: files
        });

    } catch (error) {
        console.error("[FilesController] Error Detail:", error);
        res.status(500).json({ error: "Error al listar archivos de Drive: " + error.message });
    }
}

// =============================================================================
// PROCESS EXTRACTION (New Endpoint)
// =============================================================================
async function processExtraction(req, res) {
    const { fileId, providerId, fileName, headerIndex } = req.body;

    console.log(`[FilesController] INICIO PROCESO DE EXTRACCION (Index: ${headerIndex})`);
    console.log(`   - DB Connection: ${process.env.SUPABASE_URL}`);
    console.log(`   - Archivo: ${fileId} (${fileName})`);
    console.log(`   - Proveedor: ${providerId}`);

    if (!fileId || !providerId) {
        return res.status(400).json({ error: "Faltan datos requeridos (fileId, providerId)" });
    }

    try {
        const { force } = req.body;

        // [OPTIMIZACION BYPASS] - Solo si no se fuerza la re-extracción
        if (!force) {
            // Verificar si este archivo YA fue procesado y tiene formato asignado.
            const { data: existingRecord } = await supabase
                .from('proveedor_listas_raw')
                .select(`
                    id,
                    formato_guia_id,
                    status_global,
                    proveedor_formatos_guia (
                        id,
                        reglas_mapeo,
                        nombre_formato,
                        fingerprint
                    )
                `)
                .eq('archivo_id', fileId)
                .eq('proveedor_id', providerId)
                .not('formato_guia_id', 'is', null)
                .maybeSingle();

            if (existingRecord && existingRecord.proveedor_formatos_guia) {
                console.log(`[FilesController] ⚡ BYPASS: Archivo IDENTIFICADO por ID (${fileId}). Status: ${existingRecord.status_global}`);

                // CASO 1: Archivo CONFIRMADO -> Devolvemos datos procesados (Memoria de Gestión)
                // [IMPUESTOS DE IDENTIDAD] Si está CONFIRMADO por ID, ignoramos diferencias de hash.
                if (existingRecord.status_global === 'CONFIRMED') {
                    console.log(`📦 Recuperando BODEGA (Híbrido) -> ID: ${existingRecord.id}`);

                    // [FIX] Sincronización Estricta con Schema DB
                    const { data: processedItems, error: dbError } = await supabase
                        .from('proveedor_items_extraidos')
                        .select('*')
                        .eq('lista_raw_id', existingRecord.id)
                        .order('id', { ascending: true });

                    if (dbError) throw new Error("Error recuperando bodega: " + dbError.message);

                    // [STRICT MODE] Si la bodega está vacía, reportamos ERROR DE INTEGRIDAD.
                    // El usuario (o un admin) debe decidir si re-procesar, no el sistema.
                    if (!processedItems || processedItems.length === 0) {
                        console.error(`⚠️ ERROR INTEGRIDAD: Bodega vacía para ID ${existingRecord.id} (Status: CONFIRMED).`);
                        return res.status(500).json({
                            error: "Inconsistencia de Datos: El archivo figura como 'Confirmado' pero no tiene items guardados.",
                            details: "Requiere intervención manual o re-confirmación explícita."
                        });
                    }

                    console.log(`   -> Filas recuperadas: ${processedItems.length}. Normalizando...`);

                    // 2. Preparar Mapeo Inverso basado en nombres reales
                    const mapping = existingRecord.proveedor_formatos_guia.reglas_mapeo || {};
                    // Map de etiquetas legibles
                    const labelMap = {
                        "sku": "CÓDIGO (SKU)",
                        "descripcion": "DESCRIPCIÓN",
                        "precio": "PRECIO",
                        "unidad": "UNIDAD"
                    };

                    // 3. Construcción Híbrida
                    let allHeadersSet = new Set();

                    const dynamicRows = processedItems.map(item => {
                        const raw = item.raw_data || {};
                        const newRow = {};

                        // A. Primero las columnas clave normalizadas (Priority)
                        if (item.sku) newRow["CÓDIGO (SKU)"] = item.sku;
                        if (item.descripcion) newRow["DESCRIPCIÓN"] = item.descripcion;
                        if (item.precio) newRow["PRECIO"] = item.precio;
                        if (item.unidad) newRow["UNIDAD"] = item.unidad;

                        allHeadersSet.add("CÓDIGO (SKU)");
                        allHeadersSet.add("DESCRIPCIÓN");
                        allHeadersSet.add("PRECIO");
                        if (item.unidad_medida_detectada) allHeadersSet.add("UNIDAD");

                        // B. Rellenamos con el resto del raw_data (sin pisar las clave)
                        Object.keys(raw).forEach(key => {
                            // Si esta columna original YA fue mapeada a una clave (ej: "Col A" -> SKU), la ignoramos aquí porque ya pusimos la versión normalizada
                            const isMapped = Object.values(mapping).includes(key);
                            if (!isMapped) {
                                newRow[key] = raw[key];
                                allHeadersSet.add(key);
                            }
                        });
                        return newRow;
                    });

                    // 4. Ordenar Encabezados
                    const priorityHeaders = ["CÓDIGO (SKU)", "DESCRIPCIÓN", "PRECIO", "UNIDAD"];
                    const otherHeaders = Array.from(allHeadersSet).filter(h => !priorityHeaders.includes(h));
                    const finalHeaders = [...priorityHeaders, ...otherHeaders];

                    console.log('🏁 FLAG ALREADY_MANAGED ENVIADO: true (Bodega Híbrida)');
                    return res.json({
                        success: true,
                        mode: 'MAPPED',
                        already_managed: true,
                        data: {
                            headers_detected: finalHeaders,
                            data_sample: dynamicRows,
                            suggested_mapping: {},
                            confidence_notes: "⚡ DATOS CERTIFICADOS + EXTENDIDOS"
                        },
                        raw_id: existingRecord.id,
                        debug_fingerprint: existingRecord.proveedor_formatos_guia.fingerprint,
                        safety_net: null
                    });
                }
                // CASO 2: Archivo Mapeado pero NO Confirmado.
                console.log(`   - Formato existe (${existingRecord.proveedor_formatos_guia.nombre_formato}) pero NO está CONFIRMADO. Procediendo a extracción real para mostrar datos.`);
            }
        }

        console.log("   [Controller] Calling Extraction Service...");
        const result = await extractionService.processFile(fileId, providerId, { headerIndex: parseInt(headerIndex) || 0 });

        if (result.debug_fingerprint) {
            const { calculado_ahora, guardado_db } = result.debug_fingerprint;
            if (calculado_ahora !== guardado_db) {
                console.log("\n❌ [HASH MISMATCH DETECTED]");
                console.log(`   🔸 CALCULADO: ${calculado_ahora}`);
                console.log(`   🔸 EN DB:     ${guardado_db}`);
                console.log("   -------------------------------------------------");
            }
        }

        if (!result.success) {
            console.error("[Controller] Extraction Failed:", result.error);

            return res.status(422).json({
                success: false,
                error: result.error || "Error en extracción",
                reason: result.reason || "Falló el servicio de extracción"
            });
        }

        const finalStatus = result.mode === 'MAPPED' ? 'CONFIRMED' : 'READY_TO_REVIEW';

        const { data: existingRaw } = await supabase
            .from('proveedor_listas_raw')
            .select('id')
            .eq('archivo_id', fileId)
            .maybeSingle();

        let rawRecord;
        if (existingRaw) {
            console.log(`[FilesController] Actualizando registro RAW existente: ${existingRaw.id}`);
            const { data: updated, error: updateError } = await supabase
                .from('proveedor_listas_raw')
                .update({
                    status_global: finalStatus,
                    modo_procesamiento: result.mode,
                    formato_guia_id: result.template_id || null
                })
                .eq('id', existingRaw.id)
                .select()
                .single();

            if (updateError) throw updateError;
            rawRecord = updated;
        } else {
            console.log(`[FilesController] Creando NUEVO registro RAW.`);
            const { data: inserted, error: insertError } = await supabase
                .from('proveedor_listas_raw')
                .insert({
                    proveedor_id: providerId,
                    archivo_id: fileId,
                    nombre_archivo: fileName || 'Unknown File',
                    status_global: finalStatus,
                    modo_procesamiento: result.mode,
                    formato_guia_id: result.template_id || null
                })
                .select()
                .single();

            if (insertError) throw insertError;
            rawRecord = inserted;
        }

        let isAlreadyManaged = false;

        if (rawRecord && rawRecord.formato_guia_id) {
            isAlreadyManaged = true;
            result.mode = 'MAPPED'; // Forzamos el modo para coherencia
            result.template_id = rawRecord.formato_guia_id;
            console.log(`[FilesController] CLEAN ID MATCH: ID de Formato encontrado en DB (${rawRecord.formato_guia_id}). Abriendo Modal.`);
        } else if (result.mode === 'MAPPED') {
            isAlreadyManaged = true;
        }

        return res.json({
            success: true,
            mode: result.mode,
            already_managed: isAlreadyManaged,
            template_id: result.template_id,
            data: result.data,
            raw_id: rawRecord.id,
            debug_fingerprint: result.debug_fingerprint,
            safety_net: result.safety_net
        });

    } catch (error) {
        console.error("[FilesController] Fatal Error en Process:", error);
        res.status(500).json({ error: "Error critico en proceso de extraccion: " + error.message });
    }
}

// =============================================================================
// CONFIRM EXTRACTION MAPPING
// =============================================================================
// =============================================================================
// CONFIRM EXTRACTION MAPPING (Refactored Phase 4)
// =============================================================================
async function confirmExtraction(req, res) {
    const { fileId, providerId, dataSnapshot } = req.body;

    // [PHASE 4] MODULAR INGESTION STRATEGY
    // We delegated all logic to 'ingestService'. 
    // filesController now acts as a pure router/validator.

    console.log(`[FilesController] CONFIRM INGESTION REQUEST for ${fileId}`);

    if (!fileId || !providerId || !dataSnapshot) {
        return res.status(400).json({ error: "Faltan parámetros (fileId, providerId, dataSnapshot)" });
    }

    try {
        // Delegate to Service
        const result = await ingestService.processIngestion(fileId, providerId, dataSnapshot);

        res.json({
            success: true,
            message: "Ingesta completada exitosamente.",
            details: result
        });

    } catch (error) {
        console.error("[FilesController] Error en Ingesta:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// =============================================================================
// DICTIONARY API
// =============================================================================
// =============================================================================
// DICTIONARY API (DEBUGGED & SECURED)
// =============================================================================
async function getDictionaryTerms(req, res) {
    try {
        const { providerId } = req.query;

        console.log(`[Dictionary] 🔍 Solicitando términos. Contexto: ${providerId || 'GLOBAL'}`);

        let query = supabase
            .from('user_diccionario_nomenclatura')
            .select('*')
            .order('termino', { ascending: true });

        // LÓGICA BLINDADA DE FILTRADO
        if (providerId && providerId !== 'null' && providerId !== 'undefined') {
            // Sintaxis explícita de Supabase para evitar fugas en el OR
            // "Traeme filas donde proveedor_id sea NULL, O donde sea IGUAL al ID solicitado"
            query = query.or(`proveedor_id.is.null,proveedor_id.eq.${providerId}`);
        } else {
            // Si no hay proveedor, SOLO mostrar globales. (Modo Seguro)
            console.log("   🛡️ Modo Seguro activado: Solo globales.");
            query = query.is('proveedor_id', null);
        }

        const { data, error } = await query;

        if (error) throw error;

        // --- 🕵️‍♂️ VIGÍA DEPURADOR DE FUGAS ---
        // Verificamos en JS si se coló algún intruso
        const sanitizedData = data.filter(term => {
            const isGlobal = term.proveedor_id === null;
            const isMine = providerId && term.proveedor_id === providerId;

            // Si NO es global Y NO es mío, es un intruso.
            if (!isGlobal && !isMine) {
                console.warn(`🚨 [LEAK DETECTED] Se filtró término ajeno: "${term.termino}" (Pertenece a: ${term.proveedor_id})`);
                return false; // Lo borramos de la respuesta
            }
            return true;
        });

        console.log(`   ✅ Resultados: ${sanitizedData.length} (Originales: ${data.length})`);

        res.json(sanitizedData);

    } catch (error) {
        console.error("Error fetching dictionary:", error);
        res.status(500).json({ error: error.message });
    }
}

async function createDictionaryTerm(req, res) {
    // 1. Recibimos el parámetro 'isGlobal' desde el frontend
    const { termino, descripcion, providerId, isGlobal } = req.body;

    try {
        const termUpper = termino.trim().toUpperCase();

        // 2. LÓGICA DE ALCANCE (SCOPE)
        // Si isGlobal es true, forzamos que proveedor_id sea NULL.
        // Si no, usamos el providerId que nos llega (siempre que sea válido).
        const finalProviderId = isGlobal ? null : ((providerId && providerId !== 'null') ? providerId : null);

        console.log(`[Dictionary] Creando término: ${termUpper} | Global: ${isGlobal} | Provider: ${finalProviderId}`);

        const payload = {
            termino: termUpper,
            descripcion_uso: descripcion,
            proveedor_id: finalProviderId
        };

        const { data, error } = await supabase
            .from('user_diccionario_nomenclatura')
            .insert(payload)
            .select()
            .single();

        if (error) {
            // Manejo de duplicados
            if (error.code === '23505') {
                console.warn("⚠️ Término duplicado, intentando recuperar existente...");
                let query = supabase
                    .from('user_diccionario_nomenclatura')
                    .select('*')
                    .eq('termino', termUpper);

                // Buscamos coincidencia exacta de scope para devolver el correcto
                if (finalProviderId) {
                    query = query.eq('proveedor_id', finalProviderId);
                } else {
                    query = query.is('proveedor_id', null);
                }

                const { data: existing } = await query.maybeSingle();

                if (existing) return res.json(existing);

                // Si colisiona pero no lo encontramos (caso raro de scope cruzado), lanzamos error
                return res.status(409).json({ error: "El término ya existe en este contexto." });
            }
            throw error;
        }
        res.json(data);
    } catch (error) {
        console.error("Error creating term:", error);
        res.status(500).json({ error: error.message });
    }
}

async function updateDictionaryTerm(req, res) {
    // Agregamos 'isGlobal' y 'currentProviderId' a los parámetros recibidos
    const { id, termino, descripcion_uso, reglas_procesamiento, isGlobal, currentProviderId } = req.body;
    console.log(`[FilesController] UPDATE Term Request: ID=${id}, Term=${termino}, Global=${isGlobal}`);

    if (!id || !termino) {
        return res.status(400).json({ error: "Faltan datos requeridos (id, termino)" });
    }

    try {
        const updatePayload = {
            termino: termino.trim().toUpperCase()
        };

        if (descripcion_uso !== undefined) {
            updatePayload.descripcion_uso = descripcion_uso ? descripcion_uso.trim() : null;
        }

        // --- LÓGICA DE CAMBIO DE ALCANCE (SCOPE) ---
        // Si nos envían el flag 'isGlobal', decidimos el dueño del término.
        if (isGlobal !== undefined) {
            // Si es Global -> proveedor_id es NULL
            // Si es Privado -> proveedor_id es el ID del proveedor actual (o NULL si no hay provider)
            // IMPORTANTE: currentProviderId es crucial si queremos devolverlo a "privado"
            const targetProvider = isGlobal ? null : (currentProviderId && currentProviderId !== 'null' ? currentProviderId : null);
            updatePayload.proveedor_id = targetProvider;
        }

        // [FIX] Persistent Rules Support (Merge Strategy)
        if (reglas_procesamiento !== undefined) {
            const { data: existing, error: fetchError } = await supabase
                .from('user_diccionario_nomenclatura')
                .select('reglas_procesamiento')
                .eq('id', id)
                .single();

            if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

            let mergedRules = reglas_procesamiento;
            if (existing && existing.reglas_procesamiento) {
                console.log(`[FilesController] Merging Rules for ${id}...`);
                mergedRules = { ...existing.reglas_procesamiento, ...reglas_procesamiento };

                // Protección específica para no perder regex si el UI manda split simple
                if (existing.reglas_procesamiento.type === 'regex_split' && reglas_procesamiento.type === 'split') {
                    console.warn(`[FilesController] 🛡️ Protected Regex Rule from UI Downgrade.`);
                    mergedRules.type = 'regex_split';
                }
            }
            updatePayload.reglas_procesamiento = mergedRules;
        }

        const { data, error } = await supabase
            .from('user_diccionario_nomenclatura')
            .update(updatePayload)
            .eq('id', id)
            .select();

        if (error) {
            // Manejo de colisiones: Si intentas hacerlo Global pero YA EXISTE uno global con ese nombre
            if (error.code === '23505') {
                return res.status(409).json({ error: "No se puede actualizar: Ya existe un término con este nombre en el ámbito destino (Global/Privado)." });
            }
            throw error;
        }

        if (!data || data.length === 0) {
            console.warn(`[FilesController] ⚠️ Update exitoso pero SIN DATOS retornados para ID ${id}. Verificar existencia.`);
        } else {
            console.log(`[FilesController] ✅ Term updated successfully: ${termino}`);
        }

        res.json({ success: true, data });

    } catch (error) {
        console.error("Error updating term:", error);
        res.status(500).json({ error: "Error actualizando término: " + error.message });
    }
}

// =============================================================================
// DOWNLOAD FILE STREAM (Viewer)
// =============================================================================
async function downloadFile(req, res) {
    const { fileId } = req.params;
    console.log(`[FilesController] Streaming file for viewer: ${fileId}`);

    if (!fileId) return res.status(400).send("Missing fileId");

    try {
        const metadata = await driveService.getFileMetadata(fileId);

        // Headers para descarga/visualización
        res.setHeader('Content-Type', metadata.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${metadata.name}"`);

        // Pipe directo del stream de Drive a la respuesta
        const stream = await driveService.getFileStream(fileId);
        stream.pipe(res);

        stream.on('error', (err) => {
            console.error("[Stream Error]", err);
            if (!res.headersSent) res.status(500).send("Stream Error");
        });

    } catch (error) {
        console.error("[Download Error]", error);
        const status = error.message.includes('not found') ? 404 : 500;
        res.status(status).json({
            error: error.message || "File download error",
            details: error.toString()
        });
    }
}

// =============================================================================
// DELETE DICTIONARY TERM
// =============================================================================
async function deleteDictionaryTerm(req, res) {
    const { id } = req.params;
    console.log(`[FilesController] Requesting DELETE for Term ID: ${id}`);

    if (!id) return res.status(400).json({ error: "Missing Term ID" });

    try {
        const { error } = await supabase
            .from('user_diccionario_nomenclatura')
            .delete()
            .eq('id', id);

        if (error) throw error;

        console.log(`[FilesController] ✅ Term ID ${id} deleted successfully.`);
        res.json({ success: true, message: "Término eliminado" });

    } catch (error) {
        console.error("Error deleting term:", error);
        res.status(500).json({ error: "Error eliminando término: " + error.message });
    }
}

// =============================================================================
// PROVISION VENDOR FOLDERS (INFRASTRUCTURE)
// =============================================================================
async function provisionVendorFolders(req, res) {
    const { vendorName } = req.body;
    const parentId = process.env.DRIVE_FOLDER_ID; // Root "Madre"

    if (!vendorName) return res.status(400).json({ error: "Missing vendorName" });
    if (!parentId) {
        console.error("❌ CRITICAL: DRIVE_FOLDER_ID not set in .env");
        return res.status(500).json({ error: "Server Misconfiguration: Missing DRIVE_FOLDER_ID" });
    }

    try {
        console.log(`[Provisioning] Starting infrastructure for: "${vendorName}"`);

        // 1. Create Root Folder: "PROV_[NAME]"
        // Sanitize name for Folder
        const safeName = vendorName.trim().toUpperCase().replace(/[^A-Z0-9 ÁÉÍÓÚÑ]/g, '').substring(0, 40);
        const rootFolderName = `PROV_${safeName}`;

        const rootFolder = await driveService.createFolder(rootFolderName, parentId);
        console.log(`   - Root Created: ${rootFolder.id}`);

        // 2. Create Subfolders (Parallel)
        const [pricesFolder, extractedFolder, facturasFolder] = await Promise.all([
            driveService.createFolder('Listas de Precios', rootFolder.id),
            driveService.createFolder('Listas Extraídas', rootFolder.id),
            driveService.createFolder('Facturas', rootFolder.id)
        ]);
        console.log(`   - Subfolders Created. Prices: ${pricesFolder.id}, Extracted: ${extractedFolder.id}, Facturas: ${facturasFolder.id}`);

        res.json({
            success: true,
            data: {
                rootId: rootFolder.id,
                pricesId: pricesFolder.id,
                extractedId: extractedFolder.id,
                facturasId: facturasFolder.id,
                rootLink: rootFolder.webViewLink
            }
        });

    } catch (error) {
        console.error("[Provisioning] Error:", error);
        res.status(500).json({ error: "Provisioning Failed: " + error.message });
    }
}

// =============================================================================
// PROVISION FACTURAS FOLDER (FOR LEGACY VENDORS)
// =============================================================================
async function provisionFacturasFolder(req, res) {
    const { rootId } = req.body;

    if (!rootId) return res.status(400).json({ error: "Missing rootId" });

    try {
        console.log(`[Provisioning] Creating Facturas folder for existing root: ${rootId}`);
        const facturasFolder = await driveService.createFolder('Facturas', rootId);
        
        console.log(`   - Facturas Folder Created: ${facturasFolder.id}`);

        res.json({
            success: true,
            data: {
                facturasId: facturasFolder.id
            }
        });
    } catch (error) {
        console.error("[Provisioning Facturas] Error:", error);
        res.status(500).json({ error: "Provisioning Facturas Failed: " + error.message });
    }
}

// =============================================================================
// PHASE 5: PROCESSED FILES ENDPOINTS
// =============================================================================

async function listProcessedFiles(req, res) {
    try {
        const { providerId } = req.query;
        if (!providerId) return res.status(400).json({ error: "Falta providerId" });

        const { data, error } = await supabase
            .from('proveedor_listas_raw')
            .select('id, nombre_archivo, created_at, status_global, flujo_asignado_id')
            .eq('proveedor_id', providerId)
            .in('status_global', ['CONFIRMED', 'EXTRAIDO'])
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Recuperar nombres de flujos para enriquecer la respuesta
        const { data: flujos } = await supabase
            .from('flujos_extraccion')
            .select('id_flujo, nombre_flujo')
            .eq('proveedor_id', providerId);

        const flujosMap = {};
        if (flujos) {
            flujos.forEach(f => flujosMap[f.id_flujo] = f.nombre_flujo);
        }

        const enrichedData = data.map(d => ({
            ...d,
            flujo_name: d.flujo_asignado_id ? (flujosMap[d.flujo_asignado_id] || "Flujo Desconocido") : "Suelto (Sin Vínculo)"
        }));

        res.json({ success: true, files: enrichedData });

    } catch (error) {
        console.error("[FilesController] Error listing processed:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}

async function getProcessedFileContent(req, res) {
    try {
        const { rawListId } = req.params;
        if (!rawListId) return res.status(400).json({ error: "Falta rawListId" });

        const { data, error } = await supabase
            .from('proveedor_items_extraidos')
            .select('raw_data, sheet_name')
            .eq('lista_raw_id', rawListId);

        if (error) throw error;

        // Return items with their sheet name
        const items = data.map(i => ({
            data: i.raw_data,
            sheetName: i.sheet_name
        }));

        res.json({ success: true, items: items });

    } catch (error) {
        console.error("[FilesController] Error fetching content:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}

async function assignFlujoToFile(req, res) {
    const { id } = req.params;
    const { flujo_id } = req.body;

    try {
        const { data, error } = await supabase
            .from('proveedor_listas_raw')
            .update({ flujo_asignado_id: flujo_id || null })
            .eq('id', id)
            .select()
            .single();
        
        if (error) throw error;

        res.json({ success: true, message: "Flujo asignado actualizado", data });
    } catch (error) {
        console.error("[FilesController] Error assigning flujo:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// =============================================================================
// ROLLBACK PROTOCOL (Eliminación con Opciones) 🗑️🔙
// =============================================================================
async function rollbackFiles(req, res) {
    console.log("[FilesController] 🗑️ INICIO ROLLBACK PROTOCOL");
    const { fileIds, action, providerId } = req.body; // action: 'ROLLBACK' | 'UNLINK'

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ error: "No se seleccionaron archivos." });
    }
    if (!['ROLLBACK', 'UNLINK', 'REMOVE_EXTRACTION'].includes(action)) {
        return res.status(400).json({ error: "Acción inválida. Use ROLLBACK, UNLINK o REMOVE_EXTRACTION." });
    }

    try {
        console.log(`[Rollback] Archivos: ${fileIds.length} | Acción: ${action} | Proveedor: ${providerId}`);

        // 1. Recuperar Metadatos Críticos (Carpetas de Proveedor)
        // Necesitamos saber a dónde devolver el archivo (Inbox)
        const { data: providerData, error: providerError } = await supabase
            .from('proveedores')
            .select('drive_folder_id, drive_folder_prices_id')
            .eq('id', providerId)
            .single();

        if (providerError) throw new Error("Error recuperando datos del proveedor: " + providerError.message);

        // Determinación de Destino (Business Rule: Inbox Priority)
        let targetFolderId = null;
        if (action === 'ROLLBACK') {
            if (providerData.drive_folder_prices_id) {
                targetFolderId = providerData.drive_folder_prices_id;
                console.log(`[Rollback] 🎯 Destino: Inbox Real (${targetFolderId})`);
            } else if (providerData.drive_folder_id) {
                targetFolderId = providerData.drive_folder_id;
                console.warn(`[Rollback] ⚠️ Inbox no definida. Usando RAIZ como Fallback (${targetFolderId})`);
            } else {
                console.error("[Rollback] 🚨 IMPOSIBLE MOVER: No hay carpetas definidas para el proveedor.");
                // Modificamos acción a UNLINK forzado para no romper, pero avisamos?
                // Mejor lanzar error para que el operador sepa.
                throw new Error("El proveedor no tiene carpetas configuradas. No se puede hacer Rollback físico.");
            }
        }

        const results = {
            processed: 0,
            errors: []
        };

        // 2. Iteración y Ejecución
        for (const rawListId of fileIds) {
            try {
                // A. Obtener ID de Drive del registro
                const { data: listRecord, error: listError } = await supabase
                    .from('proveedor_listas_raw')
                    .select('archivo_id, nombre_archivo') // archivo_id es el Drive File ID
                    .eq('id', rawListId)
                    .single();

                if (listError || !listRecord) {
                    throw new Error(`Registro no encontrado (ID: ${rawListId})`);
                }

                const driveFileId = listRecord.archivo_id;
                console.log(`[Rollback] Procesando: ${listRecord.nombre_archivo} (${driveFileId})`);

                // B. Movimiento Físico (Solo ROLLBACK)
                if (action === 'ROLLBACK') {
                    console.log(`   -> Moviendo a ${targetFolderId}...`);
                    await driveService.moveFile(driveFileId, targetFolderId);
                }

                // C. Integridad Referencial (Borrado Manual en Cascada)
                // Paso 1: Hijos (Items Extraídos) -> La INGESTA se borra SOLO si anulación es total (Opción 1 y 2)
                if (action !== 'REMOVE_EXTRACTION') {
                    const { error: delItemsError } = await supabase
                        .from('proveedor_items_extraidos')
                        .delete()
                        .eq('lista_raw_id', rawListId);

                    if (delItemsError) throw new Error("Error borrando items hijos: " + delItemsError.message);
                }

                // Paso 2: Padre (Lista Raw o Degradación Lógica)
                if (action === 'REMOVE_EXTRACTION') {
                    console.log(`   -> [Option C] Limpieza Quirúrgica. Degradando estado a CONFIRMED para preservarla.`);
                    const { error: updateError } = await supabase
                        .from('proveedor_listas_raw')
                        .update({ status_global: 'CONFIRMED' })
                        .eq('id', rawListId);
                    
                    if (updateError) throw new Error("Error degradando registro padre: " + updateError.message);

                    // [VECTOR B y C - FIX] Borrado sincrónico en Tabla Maestra
                    // Si revertimos la extracción, debemos físicamente sacar la data que se había insertado al master
                    console.log(`   -> Limpiando registros asociados en tabla_maestra_operativa...`);
                    const { error: masterDeleteError } = await supabase
                        .from('tabla_maestra_operativa')
                        .delete()
                        .or(`archivo_origen_id.eq.${rawListId},archivo_origen_id.eq.${driveFileId}`);

                    if (masterDeleteError && masterDeleteError.code !== '42P01') {
                        throw new Error("Error purgado de tabla maestra: " + masterDeleteError.message);
                    }
                } else {
                    console.log(`   -> Eliminando registro raíz (Lista Raw) de Base de Datos...`);
                    const { error: delListError } = await supabase
                        .from('proveedor_listas_raw')
                        .delete()
                        .eq('id', rawListId);

                    if (delListError) throw new Error("Error borrando registro padre: " + delListError.message);
                    
                    // Asegurarnos que también se borre de maestra ante un delete puro
                    const { error: masterDeleteError2 } = await supabase
                        .from('tabla_maestra_operativa')
                        .delete()
                        .or(`archivo_origen_id.eq.${rawListId},archivo_origen_id.eq.${driveFileId}`);
                        
                    if (masterDeleteError2 && masterDeleteError2.code !== '42P01') {
                        throw new Error("Error purgado de tabla maestra: " + masterDeleteError2.message);
                    }
                }

                results.processed++;

            } catch (innerError) {
                console.error(`[Rollback] Error en archivo ${rawListId}:`, innerError);
                results.errors.push({ id: rawListId, error: innerError.message });
            }
        }

        res.json({
            success: true,
            results: results
        });

    } catch (error) {
        console.error("[FilesController] Critical Rollback Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// =============================================================================
// [PERSISTENCE] SAVE TEMPLATE CONFIG (New for Step 4)
// =============================================================================
async function saveTemplateConfig(req, res) {
    console.log("[FilesController] 💾 Saving Template Configuration...");
    const { providerId, fileType, sheetName, config } = req.body;

    if (!providerId || !config) {
        return res.status(400).json({ error: "Faltan datos requeridos (providerId, config)" });
    }

    try {
        // 1. Construct Format Name (Unique Key logic)
        // E.g., "LISTA_PRECIOS_SHEET1" or just "LISTA_PRECIOS" if no sheet
        const typeSafe = (fileType || "GENERAL").toUpperCase();
        const sheetSafe = sheetName ? `_${sheetName.toUpperCase()}` : "";
        const formatName = `${typeSafe}${sheetSafe}`;

        console.log(`   - Provider: ${providerId}`);
        console.log(`   - Format Name: ${formatName}`);

        // 2. Check Existence (Upsert Logic)
        const { data: existing } = await supabase
            .from('proveedor_formatos_guia')
            .select('id')
            .eq('proveedor_id', providerId)
            .eq('nombre_formato', formatName)
            .maybeSingle();

        const payload = {
            proveedor_id: providerId,
            nombre_formato: formatName,
            hoja_excel: sheetName,
            fila_encabezado: config.offset?.row || 0,
            columna_encabezado: config.offset?.col || 0,
            reglas_mapeo: config.mapping,
            reglas_procesamiento: {
                rules: config.rules || {},
                computedColumns: config.computedCols || []
            },
            config_visual: config.config_visual || {},
            ultima_deteccion: new Date()
        };

        let resultData;

        if (existing) {
            console.log(`   - Updating existing template (ID: ${existing.id})`);
            const { data, error } = await supabase
                .from('proveedor_formatos_guia')
                .update(payload)
                .eq('id', existing.id)
                .select()
                .single();

            if (error) throw error;
            resultData = data;
        } else {
            console.log(`   - Creating NEW template`);
            const { data, error } = await supabase
                .from('proveedor_formatos_guia')
                .insert(payload)
                .select()
                .single();

            if (error) throw error;
            resultData = data;
        }

        res.json({ success: true, data: resultData });

    } catch (error) {
        console.error("[FilesController] Error saving template:", error);
        res.status(500).json({ error: "Error guardando configuración: " + error.message });
    }
}

// =============================================================================
// [PERSISTENCE] GET TEMPLATE CONFIG (Retrieve Memory)
// =============================================================================
async function getTemplateConfig(req, res) {
    const { providerId, sheetName } = req.query;

    if (!providerId) {
        return res.status(400).json({ error: "Faltan datos requeridos (providerId)" });
    }

    try {
        console.log(`[FilesController] 🧠 Buscando configuración para Proveedor ${providerId}...`);

        let query = supabase
            .from('proveedor_formatos_guia')
            .select('*')
            .eq('proveedor_id', providerId)
            .order('updated_at', { ascending: false }); // Priorizar la más reciente

        // Si tenemos nombre de hoja, intentamos buscar una específica primero
        if (sheetName) {
            // Buscamos coincidencia exacta de hoja o genérica (NULL)
            // Nota: Supabase no soporta OR complejo facilmente en cadena sin raw filter
            // Haremos fetch de todas del proveedor y filtramos en JS para lógica precisa
            // O simplificamos: Trae la ultima que coincida.
        }

        const { data, error } = await query;

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.json({ success: false, message: "No se encontraron plantillas guardadas." });
        }

        // Lógica de Selección Inteligente
        // 1. Buscamos coincidencia exacta de hoja
        let bestMatch = data.find(t => t.hoja_excel === sheetName);

        // 2. [FIX RETROC. V8] Fallback a plantilla genérica si existe
        if (!bestMatch) {
            bestMatch = data.find(t => t.hoja_excel === null || t.hoja_excel === "");
            if (bestMatch) {
                console.log("   ⚠️ Usando plantilla genérica heredada (Legacy).");
            }
        }

        if (bestMatch) {
            console.log(`   ✅ Plantilla encontrada: ${bestMatch.nombre_formato} (Offset: ${bestMatch.fila_encabezado}, ${bestMatch.columna_encabezado})`);
            return res.json({ success: true, data: bestMatch });
        } else {
            console.log("   ⚠️ No se encontró plantilla para esta hoja específica.");
            return res.json({ success: false });
        }

    } catch (error) {
        console.error("[FilesController] Error fetching template:", error);
        res.status(500).json({ error: "Error recuperando configuración: " + error.message });
    }
}

// =============================================================================
// [PERSISTENCE] DELETE TEMPLATE CONFIG (Reset Memory)
// =============================================================================
async function deleteTemplateConfig(req, res) {
    const { providerId, sheetName } = req.body; // Using body for DELETE payload

    if (!providerId) {
        return res.status(400).json({ error: "Faltan datos requeridos (providerId)" });
    }

    try {
        console.log(`[FilesController] 🗑️ Eliminando configuración para Proveedor ${providerId}...`);

        let query = supabase
            .from('proveedor_formatos_guia')
            .delete()
            .eq('proveedor_id', providerId);

        if (sheetName) {
            query = query.eq('hoja_excel', sheetName);
        } else {
            // If no sheet specified, maybe delete generic one? Or all?
            // For safety, if no sheet is specified, we only delete the generic one (null)
            query = query.is('hoja_excel', null);
        }

        const { error } = await query;

        if (error) throw error;

        console.log("✅ Configuración eliminada.");
        res.json({ success: true, message: "Configuración eliminada correctamente." });

    } catch (error) {
        console.error("[FilesController] Error deleting template:", error);
        res.status(500).json({ error: "Error eliminando configuración: " + error.message });
    }
}

// =============================================================================
// UPLOAD DIRECT FILE TO DRIVE via BUFFER
// =============================================================================
async function uploadDirectFile(req, res) {
    try {
        console.log("[FilesController] Received upload request via Multer.");
        
        if (!req.file) {
            return res.status(400).json({ error: "No se proporcionó ningún archivo." });
        }
        
        const folderId = req.body.folderId;
        if (!folderId) {
            return res.status(400).json({ error: "No se proporcionó un ID de carpeta destino (folderId)." });
        }

        const allowedMimeTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
            'text/csv' // .csv
        ];

        // Strict UI Validation matching Backend (Safe Fallback via extension)
        if (!allowedMimeTypes.includes(req.file.mimetype) && !req.file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
            console.error(`[FilesController] Upload rejected. Invalid mime: ${req.file.mimetype}`);
            return res.status(415).json({ error: "Formato de archivo no soportado. Solo se permiten archivos Excel o CSV." });
        }

        console.log(`[FilesController] Uploading ${req.file.originalname} (${req.file.size} bytes) to folder ${folderId}`);
        
        const uploadedFile = await driveService.uploadBufferToFile(
            req.file.originalname, 
            req.file.mimetype, 
            req.file.buffer, 
            folderId
        );

        res.json({ success: true, file: uploadedFile, message: "Archivo cargado correctamente en Drive." });

    } catch (error) {
        console.error("[FilesController] Upload error:", error);
        res.status(500).json({ error: "Error en servidor al cargar el archivo a Drive. " + error.message });
    }
}

module.exports = {
    listFiles,
    processExtraction,
    confirmExtraction,
    getDictionaryTerms,
    createDictionaryTerm,
    updateDictionaryTerm,
    deleteDictionaryTerm,
    downloadFile,
    provisionVendorFolders,
    provisionFacturasFolder,
    listProcessedFiles,
    getProcessedFileContent,
    rollbackFiles,
    saveTemplateConfig,
    getTemplateConfig,
    deleteTemplateConfig,
    assignFlujoToFile,
    uploadDirectFile
};