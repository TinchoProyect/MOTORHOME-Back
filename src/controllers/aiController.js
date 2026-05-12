const aiService = require('../services/aiService');
const driveService = require('../services/driveService');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = process.env.SUPABASE_URL ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY) : null;

const PROMPT_LIB_PATH = path.join(__dirname, '../../data', 'ai_prompt_library.json');

// Helper para asegurar la existencia del directorio data/
function ensurePromptLibExists() {
    const dir = path.dirname(PROMPT_LIB_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

const aiController = {
    /**
     * Endpoint: GET /api/ai/health
     * Descripción: Valida la disponibilidad del motor LLM (Local)
     */
    healthCheck: async (req, res) => {
        try {
            console.log('[AI Controller] 📡 Ejecutando Health Check del Chofer IA...');
            const isAlive = await aiService.checkIntegrity();
            if (isAlive) {
                res.status(200).json({ status: 'ok', node: 'Chofer IA', message: 'Model is responsive' });
            } else {
                res.status(503).json({ status: 'error', node: 'Chofer IA', message: 'Model is unreachable' });
            }
        } catch (error) {
            console.error('[AI Controller] ❌ Health Check falló:', error.message);
            res.status(500).json({ status: 'error', message: 'Internal Server Error' });
        }
    },

    /**
     * Endpoint: POST /api/ai/generate-etl-rule
     * Descripción: Procesa las muestras y el prompt para generar un JSON estructurado AST
     */
    generateRule: async (req, res) => {
        try {
            const { column_name, prompt, samples, require_ast } = req.body;
            
            if (!prompt || !Array.isArray(samples)) {
                return res.status(400).json({ error: 'Payload requires prompt and a samples array' });
            }

            console.log(`[AI Controller] 🚀 Procesando petición de generación AST para la columna "${column_name || 'Desconocida'}"...`);
            console.log(`[AI Controller] ℹ️ Número de muestras: ${samples.length}`);

            const responseText = await aiService.executeInference(prompt, samples, require_ast);
            
            // Log raw response from model
            console.log("[AI Controller] 🤖 Respuesta cruda del modelo:\n", responseText);

            // Attempt to parse exactly the JSON array/object inside the response
            const cleanedJsonText = aiService.extractJSONFromInference(responseText);
            
            let astRule;
            try {
                astRule = JSON.parse(cleanedJsonText);
            } catch (err) {
                console.error("\n==========================================");
                console.error("[AI Controller - STEP 5] ❌ Punto de Quiebre del Intérprete (JSON.parse falló):");
                console.error("String que se intentó parsear: ", cleanedJsonText);
                console.error("Stack Trace:");
                console.error(err.stack);
                console.error("==========================================\n");
                return res.status(502).json({ error: 'LLM returned invalid JSON' });
            }

            // Normalización: Extraer reglas del Pipeline AST multi-paso
            let ruleList = [];
            
            try {
                if (astRule.reglas && Array.isArray(astRule.reglas)) {
                    // Mapear al Schema de currentDraftPipeline del Taller Visual (1 Regla = 1 nodo ast_conditional con logic encapsulada)
                    ruleList = astRule.reglas.map((r, i) => ({
                        nombre_regla: r.nombre_regla || `Paso IA #${i+1}`,
                        descripcion: r.descripcion || astRule.explicacion_global || "Automatizado por el Chofer",
                        tipo: 'ast_conditional',
                        logica: [
                            {
                                condicion: r.condicion || { operador: "DEFAULT", valor: "" },
                                accion: r.accion || { tipo_accion: "TRIM" }
                            }
                        ]
                    }));
                } else {
                    console.error("[AI Controller - STEP 5] ❌ El JSON de la IA es válido pero NO tiene el array 'reglas'. Formato recibido:", JSON.stringify(astRule));
                    return res.status(502).json({ error: 'LLM returned invalid pipeline format' });
                }
            } catch (err) {
                console.error("\n==========================================");
                console.error("[AI Controller - STEP 5] ❌ Punto de Quiebre en la Normalización/Mapeo del AST");
                console.error(err.stack);
                console.error("==========================================\n");
                return res.status(502).json({ error: 'Falla interna en la transformación de objeto AST' });
            }

            console.log(`[AI Controller] ✅ Respuesta AST (Pipeline Multistep) mapeada satisfactoriamente con ${ruleList.length} pasos.`);
            
            // Devolver array de Reglas
            res.status(200).json({
                success: true,
                rules: ruleList
            });

        } catch (error) {
            console.error('[AI Controller] ❌ Falla en la Inferencia (generateRule):', error.message);
            res.status(500).json({ error: error.message || 'Error generating rule' });
        }
    },

    /**
     * Endpoint: POST /api/ai/refine-rule
     * Descripción: Analiza residuos (Deltas) para emitir Reglas de limpieza accesorias.
     */
    refineRule: async (req, res) => {
        try {
            const { colName, prompt, rule, residuals } = req.body;
            
            if (!residuals || !Array.isArray(residuals) || residuals.length === 0) {
                return res.status(400).json({ error: 'Payload requires a non-empty residuals array' });
            }

            console.log(`[AI Controller] 🛠️ Fase 3: Iniciando Auditoría y Refinado para la columna "${colName || 'Desconocida'}"`);
            
            const responseText = await aiService.executeRefinement(prompt, rule, residuals);
            
            const cleanedJsonText = aiService.extractJSONFromInference(responseText);
            
            let astRule;
            try {
                astRule = JSON.parse(cleanedJsonText);
            } catch (err) {
                console.error("[AI Controller] ❌ Fallo el parcheo (JSON.parse), respuesta cruda: ", cleanedJsonText);
                return res.status(502).json({ error: 'LLM returned invalid JSON on refinement' });
            }

            // Normalización para Devolver Regla 
            if (!astRule.accion || !astRule.valor) {
                 return res.status(502).json({ error: 'LLM returned missing AST parameters' });
            }

            res.status(200).json({
                success: true,
                ast: {
                     nombre_regla: astRule.nombre_regla || "Paso Delta Correctivo",
                     tipo: 'ast_conditional',
                     logica: [
                         {
                             condicion: { operador: "DEFAULT" },
                             accion: astRule
                         }
                     ]
                }
            });

        } catch (error) {
            console.error('[AI Controller] ❌ Falla en la Inferencia (refineRule):', error.message);
            res.status(500).json({ error: error.message || 'Error generating delta rule' });
        }
    },

    /**
     * Endpoint: POST /api/ai/discover-entities
     * Descripción: Analiza diccionario y devuelve Lista Blanca (Data Profiling).
     */
    discoverEntities: async (req, res) => {
        try {
            const { column_name, prompt, samples, literal_mode } = req.body;
            
            if (!prompt || !Array.isArray(samples)) {
                return res.status(400).json({ error: 'Payload requires a prompt and a unique dictionary samples array' });
            }

            console.log(`[AI Controller] 🕵️ Data Profiling (Fase 2) iniciado para columna "${column_name || 'Desconocida'}" con ${samples.length} valores en diccionario. Modo Literal: ${literal_mode || false}`);
            
            if (literal_mode) {
                // Nuevo Flujo Directo Literal (Traducción Crudo -> Limpio 1 a 1)
                const AI_Response = await aiService.executeLiteralTranslation(prompt, samples);
                return res.status(200).json({ cluster: AI_Response.translationMap });
            }

            const AI_Response = await aiService.executeEntityDiscovery(prompt, samples);
            
            let parsedRes = { cluster: [] };

            if (AI_Response.isPreParsed) {
                // Nuevo flujo de Clustering Distribuido (100% Determinista, No Laziness)
                parsedRes.cluster = AI_Response.cluster;
            } else {
                // Flujo Legacy / Backward Compat
                const cleanedJsonText = aiService.extractJSONFromInference(AI_Response.rawText);
                try {
                    parsedRes = JSON.parse(cleanedJsonText);
                } catch (err) {
                    console.error("[AI Controller] ❌ Fallo el parseo en discoverEntities (JSON.parse), respuesta cruda: ", cleanedJsonText);
                    return res.status(502).json({ error: 'LLM returned invalid JSON on Discovery phase' });
                }
                if (!parsedRes || !Array.isArray(parsedRes.cluster)) {
                     return res.status(502).json({ error: 'LLM returned missing or invalid cluster array' });
                }
            }

            // Rehidratación de Strings Crudos
            // Convertimos la matriz estricta { cluster: [ {maestro: "A", indices: [0, 1] } ] } a mapa simple { "A": ["cad", "cad"] }
            const hydratedCluster = {};
            if (Array.isArray(parsedRes.cluster)) {
                 for (const clusterObj of parsedRes.cluster) {
                      const masterName = clusterObj.maestro;
                      if (masterName === undefined || masterName === null) continue;
                      if (!hydratedCluster[masterName]) {
                          hydratedCluster[masterName] = [];
                      }
                      if (Array.isArray(clusterObj.indices)) {
                          for (const idx of clusterObj.indices) {
                               if (AI_Response.dictionaryRef[idx] !== undefined) {
                                    hydratedCluster[masterName].push(AI_Response.dictionaryRef[idx]);
                               }
                          }
                      }
                 }
            } else {
                 throw new Error("El modelo generó un cluster en formato erróneo que evadió el schema.");
            }

            res.status(200).json({
                success: true,
                cluster: hydratedCluster
            });

        } catch (error) {
            console.error('[AI Controller] ❌ Falla en Data Profiling (discoverEntities):', error.message);
            res.status(500).json({ error: error.message || 'Error in Data Profiling phase' });
        }
    },

    /**
     * Endpoint: POST /api/ai/categorize-rubros
     * Determina los rubros basándose en el diccionario y el Cuaderno Maestro
     */
    categorizeRubros: async (req, res) => {
        try {
            const { samples, forceIncrementalMap } = req.body;
            if (!samples || !Array.isArray(samples)) {
                return res.status(400).json({ error: 'Faltan muestras paramétricas (samples) o están mal formateadas.' });
            }

            // Filtrado estricto (ignorado pasivo de nulos/vacíos)
            const cleanSamples = samples
                .map(s => s ? String(s).trim() : '')
                .filter(s => s !== '' && s !== 'null' && s !== 'undefined');
                
            // Deduplicación para enviar unique values a la IA (minimizar tokens)
            const uniqueSamples = Array.from(new Set(cleanSamples));

            if (uniqueSamples.length === 0) {
                 return res.status(200).json({ cluster: forceIncrementalMap || {} });
            }

            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

            // Obtener el cuaderno maestro
            const { data: currentRubros, error } = await supabase
                .from('maestro_rubros')
                .select('*')
                .eq('es_activo', true);

            if (error && error.code !== '42P01') {
                throw error;
            }

            const activeRubros = currentRubros || [];
            
            // Si no hay rubros en la BBDD sugeriremos todo como nuevo (o devolvemos vacío)
            if (activeRubros.length === 0) {
                 console.warn("[AI Controller] Cuaderno Maestro vacío. Todo derivará a Bandeja Pendientes.");
            }

            const AI_Response = await aiService.executeCategorization(uniqueSamples, activeRubros);
            
            // Merge con el mapa incremental (si existiera algo antes)
            let resultCluster = forceIncrementalMap ? { ...forceIncrementalMap } : {};
            
            // Inject new ones
            for (const [rawKey, rubroValue] of Object.entries(AI_Response.translationMap)) {
               resultCluster[rawKey] = rubroValue;
            }

            res.status(200).json({
                success: true,
                cluster: resultCluster
            });

        } catch (error) {
            console.error("❌ [AI Controller] API Error:", error);
            res.status(500).json({ error: error.message || 'Error categorization phase' });
        }
    },

    // -----------------------------------------------------
    // Librería de Prompts Contextual (Chofer IA History)
    // -----------------------------------------------------

    /**
     * Obtiene el historial de prompts para una Columna Maestra específica.
     */
    getPromptLibrary: async (req, res) => {
        try {
            const { masterFieldId } = req.params;
            if (!masterFieldId) return res.status(400).json({ error: "Falta masterFieldId" });
            
            ensurePromptLibExists();
            
            const supabase = require('../config/supabaseClient');
            
            // 1. Obtener desde el archivo Local Global (Lo actual)
            let localPrompts = [];
            try {
                if (fs.existsSync(PROMPT_LIB_PATH)) {
                    const fileContent = fs.readFileSync(PROMPT_LIB_PATH, 'utf8') || '{}';
                    const data = JSON.parse(fileContent);
                    if (data[masterFieldId]) localPrompts = data[masterFieldId];
                }
            } catch(e) { console.warn("Fallo lectura de json library", e); }

            // 2. Extraer del Historial de Pipeline Global (de todos los proveedores)
            let dbPrompts = [];
            try {
                const { data: flujos, error } = await supabase.from('flujos_extraccion').select('config_payload');
                if (error) throw new Error(error.message);
                if (flujos) {
                    flujos.forEach(flujo => {
                        const parsed = typeof flujo.config_payload === 'string' ? JSON.parse(flujo.config_payload) : flujo.config_payload;
                        if (parsed && typeof parsed === 'object') {
                            const extractPromptsDeeply = (node) => {
                                if (!node || typeof node !== 'object') return;
                                
                                // Check if this node is a matching pipeline column
                                if (node.masterField && (node.masterField.id === masterFieldId || String(node.masterField.nombre_campo).toUpperCase() === String(masterFieldId).toUpperCase() || String(node.masterField.id) === String(masterFieldId))) {
                                    if (node.rules && Array.isArray(node.rules)) {
                                        node.rules.forEach(rule => {
                                            if (rule.fromAI) {
                                                let extractedPrompt = "";
                                                let intentVal = "Generativo";
                                                
                                                if (rule.promptData && rule.promptData.prompt) {
                                                    extractedPrompt = rule.promptData.prompt;
                                                    intentVal = rule.promptData.intent || intentVal;
                                                } else if (rule.nombre_regla && String(rule.nombre_regla).includes("[IA]")) {
                                                    extractedPrompt = String(rule.nombre_regla).replace(/\[IA\][^:]*:\s*/i, "").trim();
                                                } else if (rule.descripcion) {
                                                    extractedPrompt = rule.descripcion;
                                                } else {
                                                    extractedPrompt = rule.nombre_regla || "Regla Inteligente Genérica";
                                                }
                                                
                                                if (extractedPrompt) {
                                                    dbPrompts.push({
                                                        prompt: extractedPrompt,
                                                        intent: intentVal,
                                                        lastUsed: Date.now() - 1000
                                                    });
                                                }
                                            } else if (rule.comment && String(rule.comment).includes("Chofer:")) {
                                                dbPrompts.push({
                                                    prompt: String(rule.comment).replace("Chofer:", "").trim(),
                                                    intent: "Legacy",
                                                    lastUsed: Date.now() - 2000
                                                });
                                            }
                                        });
                                    }
                                }
                                
                                // Recurse into children
                                for (const key in node) {
                                    if (node.hasOwnProperty(key) && typeof node[key] === 'object') {
                                        extractPromptsDeeply(node[key]);
                                    }
                                }
                            };
                            
                            extractPromptsDeeply(parsed);
                        }
                    });
                }
            } catch(e) { console.error("Error consultando DB de flujos para prompts", e); }

            // 3. Unificar y desduplicar
            const merged = [...localPrompts, ...dbPrompts];
            const uniqueMap = {};
            merged.forEach(p => {
                const key = (p.prompt||"").trim().toLowerCase();
                if (!uniqueMap[key] || uniqueMap[key].lastUsed < p.lastUsed) {
                    uniqueMap[key] = p;
                }
            });

            const prompts = Object.values(uniqueMap);
            prompts.sort((a, b) => b.lastUsed - a.lastUsed);
            
            return res.status(200).json(prompts);
        } catch (error) {
            console.error("❌ [AI Controller] Error leyendo librería:", error);
            res.status(500).json({ error: 'Error leyendo librería de prompts' });
        }
    },

    /**
     * Guarda un nuevo prompt exitoso en el historial de la Columna Maestra.
     */
    savePromptToLibrary: async (req, res) => {
        try {
            const { masterFieldId, prompt, intent } = req.body;
            if (!masterFieldId || !prompt) {
                return res.status(400).json({ error: "Faltan datos obligatorios (masterFieldId, prompt)" });
            }
            
            ensurePromptLibExists();
            
            let data = {};
            if (fs.existsSync(PROMPT_LIB_PATH)) {
                try {
                    const content = fs.readFileSync(PROMPT_LIB_PATH, 'utf8');
                    data = JSON.parse(content || '{}');
                } catch (e) {
                    console.warn("[AI Controller] No se pudo leer el historial pre-existente, se reinicializa.");
                }
            }
            
            if (!data[masterFieldId]) {
                data[masterFieldId] = [];
            }
            
            // Chequear si el prompt ya existe textualmente
            const existingIdx = data[masterFieldId].findIndex(p => p.prompt.trim().toLowerCase() === prompt.trim().toLowerCase());
            
            if (existingIdx !== -1) {
                // Actualizar timestamp
                data[masterFieldId][existingIdx].lastUsed = Date.now();
                if (intent) data[masterFieldId][existingIdx].intent = intent;
            } else {
                // Nuevo
                data[masterFieldId].push({
                    prompt: prompt.trim(),
                    intent: intent || 'General',
                    lastUsed: Date.now()
                });
                
                // Limitar histórico a los últimos 30 por columna para prevenir archivo gigante
                if (data[masterFieldId].length > 30) {
                    data[masterFieldId].sort((a, b) => b.lastUsed - a.lastUsed);
                    data[masterFieldId] = data[masterFieldId].slice(0, 30);
                }
            }
            
            fs.writeFileSync(PROMPT_LIB_PATH, JSON.stringify(data, null, 2));
            return res.status(200).json({ status: 'saved' });
            
        } catch (error) {
            console.error("❌ [AI Controller] Error guardando prompt:", error);
            res.status(500).json({ error: 'Error guardando prompt en librería' });
        }
    },

    /**
     * Endpoint: POST /api/ai/ocr-prices
     * Extrae tablas de listas de precios desde imágenes vía LLM Vision (Fase 1 y Fase 2)
     */
    executeOcrPrices: async (req, res) => {
        try {
            const { fileId, fileName, providerId, action, targetSection, filasEstimadas } = req.body;
            if (!fileId || !fileName || !action) {
                return res.status(400).json({ error: "Faltan parámetros: fileId, fileName o action" });
            }

            console.log(`[AI Controller] 🚀 Iniciando OCR [${action}] para: ${fileName}`);

            // 1. Download binary from Drive
            const buffer = await driveService.downloadFileToBuffer(fileId);
            const base64Data = buffer.toString('base64');

            // 2. Determine mimetype
            let mimeType = 'image/jpeg';
            const lowerFileName = fileName.toLowerCase();
            if (lowerFileName.endsWith('.png')) mimeType = 'image/png';
            else if (lowerFileName.endsWith('.webp')) mimeType = 'image/webp';
            else if (lowerFileName.endsWith('.pdf')) mimeType = 'application/pdf';

            const dataUrl = `data:${mimeType};base64,${base64Data}`;

            // Obtener el Custom Schema del proveedor (si existe)
            let customSchema = null;
            if (providerId && supabase) {
                try {
                    const { data: provInfo, error } = await supabase
                        .from('proveedores')
                        .select('mapa_ocr_listas')
                        .eq('id', providerId)
                        .single();
                    if (!error && provInfo && provInfo.mapa_ocr_listas) {
                        try {
                            customSchema = JSON.parse(provInfo.mapa_ocr_listas);
                        } catch (e) {
                            // Fallback retrocompatibilidad: si no es JSON, es solo el prompt
                            customSchema = { prompt: provInfo.mapa_ocr_listas };
                        }
                    }
                } catch (e) {
                    console.warn("[AI Controller] No se pudo obtener mapa_ocr_listas", e.message);
                }
            }

            if (action === 'index') {
                // Fase 1: Indexado de Secciones
                const result = await aiService.executePriceListOCRIndex(dataUrl, mimeType);
                // Adjuntamos el customSchema a la respuesta para que la grilla frontal lo adapte
                result.customSchema = customSchema;
                return res.status(200).json({ success: true, data: result });
            } 
            else if (action === 'section') {
                if (!targetSection) return res.status(400).json({ error: "Falta targetSection" });
                
                // Fase 2: Extracción Quirúrgica
                const result = await aiService.executePriceListOCRSection(dataUrl, mimeType, targetSection, customSchema, filasEstimadas);
                
                // --- INICIO FILTRO DE EXCLUSIÓN TEMPRANA (ROLLBACK PREVENTIVO) ---
                if (result && result.productos && Array.isArray(result.productos)) {
                    const originalCount = result.productos.length;
                    
                    result.productos = result.productos.filter(prod => {
                        let hasValidPrice = false;
                        
                        // Recorremos todas las claves buscando indicadores de precio
                        for (const key in prod) {
                            if (key.startsWith('precio_') || key.toLowerCase().includes('precio')) {
                                // Sanitizamos y parseamos para evitar floats falsos o ceros ("0", "$0", "")
                                const valStr = String(prod[key]).replace(/[^\d.,-]/g, '');
                                let floatVal = 0;
                                
                                if (valStr) {
                                    const lastDot = valStr.lastIndexOf('.');
                                    const lastComma = valStr.lastIndexOf(',');
                                    
                                    if (lastDot > lastComma && lastComma !== -1) {
                                        floatVal = parseFloat(valStr.replace(/,/g, ''));
                                    } else if (lastComma > lastDot && lastDot !== -1) {
                                        floatVal = parseFloat(valStr.replace(/\./g, '').replace(',', '.'));
                                    } else {
                                        floatVal = parseFloat(valStr.replace(/,/g, '.'));
                                    }
                                }
                                
                                if (!isNaN(floatVal) && floatVal > 0) {
                                    hasValidPrice = true;
                                    break;
                                }
                            }
                        }
                        return hasValidPrice;
                    });
                    
                    console.log(`[AI Controller - Vigilancia OCR] Filas originales: ${originalCount} | Filas purgadas (Sin Precio): ${originalCount - result.productos.length} | Filas viables: ${result.productos.length}`);
                    
                    // --- BARRERA DE CONTENCIÓN (Límite Estricto) ---
                    const maxFilas = parseInt(filasEstimadas, 10);
                    if (!isNaN(maxFilas) && maxFilas > 0) {
                        if (result.productos.length > maxFilas) {
                            console.warn(`[AI Controller - Vigilancia OCR] ⚠️ ALERTA DE FUGA SEMÁNTICA: El modelo devolvió ${result.productos.length} filas pero el límite de la Fase 1 es ${maxFilas}. Truncando excedente para evitar contaminación cruzada.`);
                            result.productos = result.productos.slice(0, maxFilas);
                        }
                    }
                    // --- MOTOR MATEMÁTICO (Columnas Calculadas) ---
                    if (customSchema && customSchema.calculated_columns && Array.isArray(customSchema.calculated_columns)) {
                        result.productos.forEach(prod => {
                            customSchema.calculated_columns.forEach(calc => {
                                if (calc.formula) {
                                    const parts = calc.formula.trim().split(/\s+/);
                                    if (parts.length === 3) {
                                        const valA = parseFloat(prod[parts[0]]);
                                        const operator = parts[1];
                                        const valB = parseFloat(prod[parts[2]]);
                                        
                                        if (!isNaN(valA) && !isNaN(valB)) {
                                            let res = 0;
                                            if (operator === '/') res = valB !== 0 ? valA / valB : 0;
                                            else if (operator === '*') res = valA * valB;
                                            else if (operator === '+') res = valA + valB;
                                            else if (operator === '-') res = valA - valB;
                                            prod[calc.field] = res;
                                        }
                                    }
                                }
                            });
                        });
                        console.log(`[AI Controller - Motor Matemático] Se ejecutaron cálculos para ${customSchema.calculated_columns.length} columna(s) en ${result.productos.length} fila(s).`);
                    }
                }
                // --- FIN FILTRO DE EXCLUSIÓN ---

                return res.status(200).json({ success: true, data: result });
            } 
            else {
                return res.status(400).json({ error: "Acción inválida" });
            }

        } catch (error) {
            console.error("❌ [AI Controller] Error OCR Prices:", error);
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = aiController;
