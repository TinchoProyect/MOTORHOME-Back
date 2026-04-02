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
                console.error("[AI Controller] ❌ Error parseando la salida JSON del modelo:", err.message);
                return res.status(502).json({ error: 'LLM returned invalid JSON' });
            }

            // Normalización para alinear con el request AST de la UI
            // El modelo a veces retorna directamente la lógica o el objeto root
            const normalizedAst = {
                tipo: 'ast_conditional',
                logica: astRule.logica || astRule, // Fallback porsi devuelve un mero arreglo
                explicacion: astRule.explicacion || "Generado automáticamente por Chofer IA"
            };

            console.log("[AI Controller] ✅ Respuesta AST armada satisfactoriamente.");
            
            // Devolver Response standard
            res.status(200).json({
                success: true,
                rule: normalizedAst
            });

        } catch (error) {
            console.error('[AI Controller] ❌ Falla en la Inferencia (generateRule):', error.message);
            res.status(500).json({ error: error.message || 'Error generating rule' });
        }
    }
};

module.exports = aiController;
