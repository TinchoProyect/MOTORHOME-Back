-- 1. Agregar columna de IVA histórico a los items del pedido
ALTER TABLE public.pedidos_b2b_items ADD COLUMN IF NOT EXISTS iva_aplicado NUMERIC(5,2) DEFAULT 0;

-- 2. Migrar los registros existentes usando el catálogo actual
UPDATE public.pedidos_b2b_items p
SET iva_aplicado = COALESCE(
    (SELECT t.iva 
     FROM public.tabla_maestra_operativa t 
     WHERE t.codigo = p.producto_codigo OR t.sku = p.producto_codigo 
     LIMIT 1), 
    0
)
WHERE iva_aplicado IS NULL OR iva_aplicado = 0;

-- 3. Recrear la vista vw_inventario_consolidado para que arrastre el IVA
DROP VIEW IF EXISTS public.vw_inventario_consolidado;

CREATE OR REPLACE VIEW public.vw_inventario_consolidado AS
SELECT
    pbi.producto_codigo AS sku,
    pbi.producto_descripcion AS descripcion,
    SUM(rfi.cantidad_recibida) AS stock_fisico,
    MAX(rfi.created_at) AS ultimo_ingreso,
    MAX(pbi.iva_aplicado) AS iva_aplicado -- <-- ¡AQUÍ ESTÁ LA MAGIA!
FROM
    public.recepciones_fisicas_items rfi
JOIN
    public.pedidos_b2b_items pbi ON rfi.pedido_item_id = pbi.id
WHERE
    rfi.cantidad_recibida > 0
GROUP BY
    pbi.producto_codigo,
    pbi.producto_descripcion;
