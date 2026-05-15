/**
 * Motor de Reglas de Conciliación Aisladas por Proveedor
 * Aplica conversiones y normalizaciones asimétricas (UOM) en la Etapa 3 (HITL)
 * para evitar fallos de deltas masivos entre Pedidos B2B y Facturas Extraídas.
 */

const ProviderConciliationRules = {
    // ----------------------------------------------------
    // REGLA: PUEBLO_VIEJO (Asimetría Inversa: Factura en Bultos, Pedido en Kilos)
    // ----------------------------------------------------
    "PUEBLO_VIEJO": (params) => {
        let { cantF, precioF, cantR, precioP, factorConversion } = params;

        // CASO 1: Asimetría de Precio (Cantidades Iguales pero Precios desfasados por UOM)
        // El operador ingresó la cantidad física en cajas (ej. 6), la factura dice 6, pero el PrecioP es por kilo.
        if (factorConversion > 1.1 && precioP > 0) {
            const apparentPriceFactor = precioF / precioP;
            const priceTolerance = factorConversion * 0.25; // 25% de tolerancia (catch-weight o inflación)
            
            if (Math.abs(apparentPriceFactor - factorConversion) <= priceTolerance) {
                // NORMALIZACIÓN: La cantidad está simétrica (ambas en cajas),
                // pero el precio facturado está inflado por el factor respecto al precio base por kilo.
                // Llevamos el Precio de la Factura al plano base (Kilo) para el cálculo del Delta.
                return {
                    normalizedCantR: cantR, 
                    normalizedPrecioP: precioP,
                    
                    overrideCantF: cantF, // Se mantiene intacto para no falsear faltantes
                    overridePrecioF: precioF / factorConversion, // Bajamos el precio facturado a Kilo
                    
                    ruleApplied: true,
                    ruleName: "PUEBLO_VIEJO_PRICE_UOM"
                };
            }
        }

        // CASO 2: Asimetría Inversa Tradicional (Factura en Bultos, Pedido en Kilos puros)
        if (cantF < cantR && factorConversion > 1.1) {
            const apparentFactor = cantR / cantF;
            const tolerance = factorConversion * 0.2; 
            
            if (Math.abs(apparentFactor - factorConversion) <= tolerance) {
                return {
                    normalizedCantR: cantR, 
                    normalizedPrecioP: precioP, 
                    overrideCantF: cantF * factorConversion, 
                    overridePrecioF: precioF / factorConversion, 
                    ruleApplied: true,
                    ruleName: "PUEBLO_VIEJO_INVERSE_UOM"
                };
            }
        }
        
        return null; // Fallback
    },

    // ----------------------------------------------------
    // REGLA: BAVOSI (Asimetría de Precio en Bultos)
    // ----------------------------------------------------
    "BAVOSI": (params) => {
        let { cantF, precioF, cantR, precioP, factorConversion } = params;

        // Bavosi también presenta facturación en bultos (ej. precio de la caja)
        // mientras el sistema (y la recepción) están por kilo o unidad base.
        if (factorConversion > 1.1 && precioP > 0) {
            const apparentPriceFactor = precioF / precioP;
            const priceTolerance = factorConversion * 0.25; 
            
            if (Math.abs(apparentPriceFactor - factorConversion) <= priceTolerance) {
                return {
                    normalizedCantR: cantR, 
                    normalizedPrecioP: precioP,
                    
                    overrideCantF: cantF, 
                    overridePrecioF: precioF / factorConversion, // Baja el precio facturado al plano base
                    
                    ruleApplied: true,
                    ruleName: "BAVOSI_PRICE_UOM"
                };
            }
        }
        
        return null; // Fallback
    },

    // ----------------------------------------------------
    // REGLA: QUERCUS (Asimetría de Precio en Bultos)
    // ----------------------------------------------------
    "QUERCUS": (params) => {
        let { cantF, precioF, cantR, precioP, factorConversion } = params;

        // Quercus factura en bultos cerrados (ej. precio de la caja)
        // mientras el sistema (y la recepción) computa las cantidades recibidas también en bultos,
        // pero el precio_pactado original está expresado en Kilos o Unidades base.
        if (factorConversion > 1.1 && precioP > 0) {
            const apparentPriceFactor = precioF / precioP;
            const priceTolerance = factorConversion * 0.25; 
            
            if (Math.abs(apparentPriceFactor - factorConversion) <= priceTolerance) {
                return {
                    normalizedCantR: cantR, 
                    normalizedPrecioP: precioP,
                    
                    overrideCantF: cantF, 
                    overridePrecioF: precioF / factorConversion, // Baja el precio facturado al plano base
                    
                    ruleApplied: true,
                    ruleName: "QUERCUS_PRICE_UOM"
                };
            }
        }
        
        return null; // Fallback
    }
};

/**
 * Función inyectora que evalúa y ejecuta la regla si el proveedor la posee.
 */
const applyConciliationRule = (providerKey, matchItem, artFactura, factorConversion, cantR, precioP) => {
    // 1. Extraer los valores en crudo de la Factura
    const cantF = parseFloat(artFactura.cantidad || 0);
    const precioF = parseFloat(artFactura.precio_unitario || 0);

    // 2. Determinar la llave maestra del proveedor
    let ruleKey = "DEFAULT";
    if (providerKey) {
        const upperKey = String(providerKey).toUpperCase();
        // Mapeo por UUID conocido o nombre
        if (upperKey.includes("PUEBLO_VIEJO") || upperKey === "C6FF44E4-C593-497A-BB2A-3EC45E7DEB2F") {
            ruleKey = "PUEBLO_VIEJO";
        } else if (upperKey.includes("BAVOSI") || upperKey === "8929039A-407E-40DD-A399-98D17F647DC4") {
            ruleKey = "BAVOSI";
        } else if (upperKey.includes("QUERCUS") || upperKey === "69544027-2936-4DF6-B728-CBD171BB1594") {
            ruleKey = "QUERCUS";
        }
    }

    // 3. Evaluar
    const ruleFunction = ProviderConciliationRules[ruleKey];
    if (ruleFunction) {
        const result = ruleFunction({ cantF, precioF, cantR, precioP, factorConversion });
        if (result && result.ruleApplied) {
            return result;
        }
    }

    // 4. No hay regla o no aplicó -> Retorna false (debe actuar el Motor Heurístico General)
    return false;
};

module.exports = {
    applyConciliationRule,
    ProviderConciliationRules
};
