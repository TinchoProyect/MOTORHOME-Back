-- Migration: 036_inventario_consolidado.sql
-- Description: Vista consolidada de inventario basada en eventos de recepción física

CREATE OR REPLACE VIEW public.vw_inventario_consolidado AS
SELECT
    p.producto_codigo AS sku,
    MAX(p.producto_descripcion) AS descripcion,
    SUM(i.cantidad_recibida) AS stock_fisico,
    MAX(c.fecha_recepcion) AS ultimo_ingreso
FROM
    public.recepciones_fisicas_items i
JOIN
    public.recepciones_fisicas_cabecera c ON i.recepcion_id = c.id
JOIN
    public.pedidos_b2b_items p ON i.pedido_item_id = p.id
WHERE
    c.estado != 'Anulada'
GROUP BY
    p.producto_codigo;
