const aiService = require('../services/aiService');

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
            const { column_name, prompt, samples } = req.body;
            
            if (!prompt || !Array.isArray(samples)) {
                return res.status(400).json({ error: 'Payload requires a prompt and a unique dictionary samples array' });
            }

            console.log(`[AI Controller] 🕵️ Data Profiling (Fase 2) iniciado para columna "${column_name || 'Desconocida'}" con ${samples.length} valores en diccionario.`);
            
            const responseText = await aiService.executeEntityDiscovery(prompt, samples);
            
            const cleanedJsonText = aiService.extractJSONFromInference(responseText);
            
            let parsedRes;
            try {
                parsedRes = JSON.parse(cleanedJsonText);
            } catch (err) {
                console.error("[AI Controller] ❌ Fallo el parseo en discoverEntities (JSON.parse), respuesta cruda: ", cleanedJsonText);
                return res.status(502).json({ error: 'LLM returned invalid JSON on Discovery phase' });
            }

            if (!parsedRes || typeof parsedRes.cluster !== 'object' || Array.isArray(parsedRes.cluster)) {
                 return res.status(502).json({ error: 'LLM returned missing or invalid cluster object' });
            }

            res.status(200).json({
                success: true,
                cluster: parsedRes.cluster
            });

        } catch (error) {
            console.error('[AI Controller] ❌ Falla en Data Profiling (discoverEntities):', error.message);
            res.status(500).json({ error: error.message || 'Error in Data Profiling phase' });
        }
    }
};

module.exports = aiController;
