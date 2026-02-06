/**
 * Provider Context Resolver
 * Centralizes the logic to identify the current active provider.
 * v1.1 (Fix: Uses Accessor Method instead of raw variable)
 */
window.resolveProviderContext = function (providerId) {
    if (!providerId) {
        console.warn("[ProviderResolver] No Provider ID provided.");
        return {
            id: null,
            nombre: "DATO HISTÓRICO",
            categoria: "DESCONOCIDO"
        };
    }

    // 1. OBTENCIÓN DE DATOS (LA CORRECCIÓN)
    // Intentamos obtener la lista usando el Getter oficial del Core (si existe), o fallbacks a la variable global.
    let suppliersList = [];

    if (typeof window.getCurrentSuppliers === 'function') {
        suppliersList = window.getCurrentSuppliers(); // ✅ Usamos la llave correcta
    } else if (window.currentSuppliers && Array.isArray(window.currentSuppliers)) {
        suppliersList = window.currentSuppliers; // Fallback por si cambia la arquitectura
    }

    // 2. BUSQUEDA EN CACHÉ
    if (suppliersList && Array.isArray(suppliersList)) {
        const supplier = suppliersList.find(s => s.id === providerId);

        if (supplier) {
            console.log(`[ProviderResolver] Resolved cached provider: ${supplier.nombre}`);
            return {
                ...supplier, // Spread detailed properties
                id: supplier.id,
                nombre: supplier.nombre,
                categoria: supplier.categoria || "GENERAL"
            };
        }
    }

    // 3. Fallback: If not found in cache but we have an ID
    console.warn(`[ProviderResolver] Provider ID ${providerId} not found in current cache (Items: ${suppliersList ? suppliersList.length : 0}).`);
    return {
        id: providerId,
        nombre: `Proveedor ID: ${providerId.substring(0, 8)}...`, // Truncated for display
        categoria: "NO IDENTIFICADO"
    };
};