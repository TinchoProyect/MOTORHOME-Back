/**
 * Motor de Reglas de Mapeo y Saneamiento Financiero
 * Aplica lógica determinista post-extracción IA basándose en el Proveedor.
 */

const parseSafeFloat = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    
    let str = String(val).trim();
    
    // Si la IA mandó un string de número con formato LatAm (ej: "4.115.553,62" o "4,115,553.62")
    // 1. Verificar si tiene comas y puntos
    const hasComma = str.includes(',');
    const hasDot = str.includes('.');
    
    if (hasComma && hasDot) {
        const lastCommaIndex = str.lastIndexOf(',');
        const lastDotIndex = str.lastIndexOf('.');
        
        if (lastCommaIndex > lastDotIndex) {
            // Formato Español: "4.115.553,62"
            str = str.replace(/\./g, ''); // Quita puntos (miles)
            str = str.replace(',', '.');  // Cambia coma por punto (decimal)
        } else {
            // Formato Inglés: "4,115,553.62"
            str = str.replace(/,/g, ''); // Quita comas (miles)
        }
    } else if (hasComma && !hasDot) {
        // Solo coma (ej: "155,50")
        str = str.replace(',', '.');
    }
    
    // Limpia cualquier otro caracter no numérico excepto el punto y el signo
    str = str.replace(/[^0-9.-]/g, '');
    
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
};

const roundToTwo = (num) => {
    return Math.round(num * 100) / 100;
};

const ProviderBillingRules = {
    // ----------------------------------------------------
    // REGLA: BILLARES/VILLARES (Cálculo de Subtotales por Kilo / Factor)
    // ----------------------------------------------------
    // ID de proveedor en Supabase: 5515e04d-248d-416c-8cb2-d36e006d549d
    // CUIT de proveedor sin guiones: 30537853014
    "5515e04d-248d-416c-8cb2-d36e006d549d": (extractedJson) => {
        if (extractedJson.articulos && extractedJson.articulos.length > 0) {
            extractedJson.articulos = extractedJson.articulos.map(art => {
                const cant = parseSafeFloat(art.cantidad || 1);
                const puOriginal = parseSafeFloat(art.precio_unitario || 0);
                const factor = parseSafeFloat(art.factor_conversion || 1);
                
                // [DIRECTIVA DETERMINISTA] Fórmula obligatoria del Ticket #136:
                // Subtotal = Cantidad * Factor de Conversión (Kilos) * Precio Unitario
                const subtotalCalculado = cant * factor * puOriginal;

                return {
                    ...art,
                    precio_unitario_original: puOriginal,
                    precio_unitario: puOriginal, // Para Billares, el PU es el valor neto por kilogramo
                    factor_conversion: factor,
                    subtotal: roundToTwo(subtotalCalculado),
                    cantidad: cant
                };
            });
        }
        return extractedJson;
    },
    "30537853014": (extractedJson) => {
        // Redireccionar al handler principal de Villares usando la misma función
        return ProviderBillingRules["5515e04d-248d-416c-8cb2-d36e006d549d"](extractedJson);
    },

    // ----------------------------------------------------
    // REGLA: BAVOSI / BABOSI (Soporte Pasivo UOM-Aware)
    // ----------------------------------------------------
    // ID de proveedor en Supabase: 8929039a-407e-40dd-a399-98d17f647dc4
    // CUIT de proveedor sin guiones: 30716631899
    "8929039a-407e-40dd-a399-98d17f647dc4": (extractedJson) => {
        if (extractedJson.articulos && extractedJson.articulos.length > 0) {
            extractedJson.articulos = extractedJson.articulos.map(art => {
                const cant = parseSafeFloat(art.cantidad || 1);
                const factor = parseSafeFloat(art.factor_conversion || 1);
                const puOriginal = parseSafeFloat(art.precio_unitario || 0);

                // [SOPORTE PASIVO UOM-AWARE]
                // Respetamos de forma soberana el precio unitario extraído por la IA (ya por kilo).
                // Calculamos el subtotal de línea multiplicando Cantidad * Factor * Precio Unitario.
                const subtotalCalculado = cant * factor * puOriginal;

                return {
                    ...art,
                    precio_unitario_original: puOriginal,
                    precio_unitario: puOriginal, // Mantenemos el precio por kilo
                    factor_conversion: factor,
                    subtotal: roundToTwo(subtotalCalculado),
                    cantidad: cant
                };
            });
        }
        return extractedJson;
    },
    "30716631899": (extractedJson) => {
        return ProviderBillingRules["8929039a-407e-40dd-a399-98d17f647dc4"](extractedJson);
    },
    "30629646708": (extractedJson) => {
        return ProviderBillingRules["8929039a-407e-40dd-a399-98d17f647dc4"](extractedJson);
    },
    "BABOSI": (extractedJson) => {
        return ProviderBillingRules["8929039a-407e-40dd-a399-98d17f647dc4"](extractedJson);
    },

    // ----------------------------------------------------
    // REGLA DEFAULT (Prorrateo por Monto Global)
    // ----------------------------------------------------
    "DEFAULT": (extractedJson) => {
        const descuentoGlobal = parseSafeFloat(extractedJson.descuento_global_aplicado || 0);
        const netoGravado = parseSafeFloat(extractedJson.importe_neto_gravado || 0);
        
        if (extractedJson.articulos && extractedJson.articulos.length > 0) {
            let factorDescuento = 1.0;
            
            if (descuentoGlobal > 0 && netoGravado > 0) {
                let sumaSubtotales = 0;
                extractedJson.articulos.forEach(art => {
                    const cant = parseSafeFloat(art.cantidad || 1);
                    const pu = parseSafeFloat(art.precio_unitario || 0);
                    sumaSubtotales += parseSafeFloat(art.subtotal || (cant * pu));
                });

                if (sumaSubtotales > 0) {
                    factorDescuento = netoGravado / sumaSubtotales;
                }
            }

            extractedJson.articulos = extractedJson.articulos.map(art => {
                const cant = parseSafeFloat(art.cantidad || 1);
                const puOriginal = parseSafeFloat(art.precio_unitario || 0);
                
                const puProrrateado = puOriginal * factorDescuento;
                
                return {
                    ...art,
                    precio_unitario_original: puOriginal,
                    precio_unitario: roundToTwo(puProrrateado),
                    subtotal: roundToTwo(cant * puProrrateado),
                    cantidad: cant
                };
            });
        }
        return extractedJson;
    }
};

const applyBillingRule = (providerId, providerCuit, extractedJson) => {
    // Si queremos mapear por nombre, CUIT o ID, ajustamos aquí.
    // Por ahora, vamos a simular que el CUIT de Babosi desencadena su regla.
    // Babosi CUIT = 30-71112223-3 (ejemplo) o por el ID en supabase.
    // En el futuro, esto se puede cargar de la BD.
    
    const cuitEmisor = String(extractedJson.cuit_emisor || '').replace(/[^0-9]/g, '');
    
    // Identificador Hardcodeado temporalmente para Babosi (CUIT o similar)
    // Asumimos que Babosi puede ser detectado por su CUIT. Reemplazar esto con una consulta si es necesario.
    let ruleKey = "DEFAULT";
    
    // Opcional: Si sabemos el CUIT de Babosi lo ponemos aquí
    if (cuitEmisor === '30716631899' || cuitEmisor === '30629646708' || (extractedJson.cuit_emisor && (extractedJson.cuit_emisor.toLowerCase().includes('babosi') || extractedJson.cuit_emisor.toLowerCase().includes('bavosi')))) {
        ruleKey = "BABOSI"; // No tenemos el CUIT real a mano, pero podemos mapearlo por nombre de proveedor en base de datos.
    }
    
    // Mejor enfoque: Buscar por ID en nuestro diccionario (si supiéramos el UUID)
    if (ProviderBillingRules[providerId]) {
        ruleKey = providerId;
    } else if (cuitEmisor && ProviderBillingRules[cuitEmisor]) {
        ruleKey = cuitEmisor;
    }

    // fallback si no se mapeó dinámicamente arriba: vamos a usar "BABOSI" hardcodeado temporal si se necesita, 
    // pero el controller nos puede pasar el nombre.

    const ruleToExecute = ProviderBillingRules[ruleKey] || ProviderBillingRules["DEFAULT"];
    
    // Aplicamos saneamiento a los valores principales
    extractedJson.importe_neto_gravado = parseSafeFloat(extractedJson.importe_neto_gravado);
    extractedJson.importe_iva_21 = parseSafeFloat(extractedJson.importe_iva_21);
    extractedJson.importe_iva_105 = parseSafeFloat(extractedJson.importe_iva_105);
    extractedJson.importe_iva_27 = parseSafeFloat(extractedJson.importe_iva_27);
    extractedJson.percepciones_iibb = parseSafeFloat(extractedJson.percepciones_iibb);
    extractedJson.percepciones_iva = parseSafeFloat(extractedJson.percepciones_iva);
    extractedJson.conceptos_no_gravados = parseSafeFloat(extractedJson.conceptos_no_gravados);
    extractedJson.importe_total = parseSafeFloat(extractedJson.importe_total);

    // Ejecutamos la regla sobre los artículos
    const processedJson = ruleToExecute(extractedJson);

    // =====================================
    // CHECKSUM DETERMINISTA
    // =====================================
    let sumSubtotales = 0;
    if (processedJson.articulos && Array.isArray(processedJson.articulos)) {
        processedJson.articulos.forEach(art => {
            sumSubtotales += parseSafeFloat(art.subtotal || 0);
        });
    }
    
    const diff = Math.abs(sumSubtotales - processedJson.importe_neto_gravado);
    processedJson.checksum_valido = diff <= 5.00;
    processedJson.checksum_diferencia = roundToTwo(diff);
    processedJson.checksum_sumatoria = roundToTwo(sumSubtotales);

    return processedJson;
};

module.exports = {
    applyBillingRule,
    parseSafeFloat,
    ProviderBillingRules
};
