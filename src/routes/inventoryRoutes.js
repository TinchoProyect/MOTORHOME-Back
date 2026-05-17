const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');

// GET: Obtener stock consolidado
router.get('/stock', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vw_inventario_consolidado')
            .select('*')
            .order('sku', { ascending: true });

        if (error) throw error;

        // Recuperar facturas para mapear IVA empírico (Determinismo Ticket #084)
        const { data: facturas, error: facErr } = await supabase
            .from('facturas_raw')
            .select('id, importe_iva_21, importe_iva_105, match_report, created_at')
            .not('match_report', 'is', null)
            .order('created_at', { ascending: false });

        // Recuperar notas de débito para compensaciones comerciales (Ticket #086)
        const { data: ccp } = await supabase
            .from('cuenta_corriente_proveedores')
            .select('referencia_factura_id, monto_debito')
            .eq('tipo_movimiento', 'NOTA_DEBITO_INTERNA')
            .gt('monto_debito', 0);
            
        const adjMap = {};
        if (ccp) {
            ccp.forEach(r => adjMap[r.referencia_factura_id] = true);
        }

        let skuIvaMap = {};
        let skuPricingMap = {}; // Mapa para guardar el precio real por unidad/kilo
        let skuConfidence = {}; // Para evitar que un fallback sobrescriba una certeza matemática
        if (facturas) {
            facturas.forEach(f => {
                const i21 = parseFloat(f.importe_iva_21) || 0;
                const i105 = parseFloat(f.importe_iva_105) || 0;
                
                let mr = f.match_report;
                if (typeof mr === 'string') {
                    try { mr = JSON.parse(mr); } catch(e) { mr = []; }
                }
                
                if (Array.isArray(mr)) {
                    mr.forEach(m => {
                        const p = m.pedido || {};
                        const sku = p.codigo || p.producto_codigo || p.sku;
                        if (!sku) return;

                        let inferredIva = 21;
                        let confidence = 0; // 0 = Fallback, 1 = Factura Pura, 2 = Matemáticamente Probado

                        if (i21 === 0 && i105 === 0) {
                            inferredIva = 0; confidence = 1;
                        } else if (i105 > 0 && i21 === 0) {
                            inferredIva = 10.5; confidence = 1;
                        } else if (i21 > 0 && i105 === 0) {
                            inferredIva = 21; confidence = 1;
                        } else {
                            // Factura Mixta: Inferencia Matemática por Subtotal
                            const sub = m.factura ? parseFloat(m.factura.subtotal) || 0 : 0;
                            if (sub > 0) {
                                const check21 = sub * 0.21;
                                const check105 = sub * 0.105;
                                if (Math.abs(check21 - i21) < 5) {
                                    inferredIva = 21; confidence = 2;
                                } else if (Math.abs(check105 - i105) < 5) {
                                    inferredIva = 10.5; confidence = 2;
                                } else {
                                    inferredIva = 21; confidence = 0; // Fallback ciego
                                }
                            } else {
                                inferredIva = 21; confidence = 0;
                            }
                        }

                        // Guardar si no existe o si tenemos mayor confianza empírica
                        const currentConf = skuConfidence[sku] !== undefined ? skuConfidence[sku] : -1;
                        if (confidence > currentConf) {
                            skuIvaMap[sku] = inferredIva;
                            skuConfidence[sku] = confidence;
                        }

                        // Extracción de Precio Real y Compensaciones (Ticket #086 / #088)
                        const hasAdjustment = !!adjMap[f.id];
                        const factor = p.factor_conversion || 1;
                        
                        let precio_kilo = p.precio_unitario || 0; // Fallback
                        
                        // Fórmula Universal: Masa Económica (Subtotal) dividida por Masa Física (Kilos Totales Recibidos)
                        if (m.factura && m.factura.subtotal && m.recibido) {
                            const total_kilos = m.recibido * factor;
                            if (total_kilos > 0) {
                                precio_kilo = parseFloat(m.factura.subtotal) / total_kilos;
                            }
                        }
                        
                        if (hasAdjustment && m.delta_monto) {
                            precio_kilo = precio_kilo - parseFloat(m.delta_monto);
                        }
                        
                        if (skuPricingMap[sku] === undefined) {
                            skuPricingMap[sku] = precio_kilo;
                        }
                    });
                }
            });
        }

        // Inyectar el IVA y Precio de la factura al lote
        if (data) {
            data.forEach(item => {
                if (skuIvaMap[item.sku] !== undefined) {
                    item.iva_aplicado = skuIvaMap[item.sku];
                }
                if (skuPricingMap[item.sku] !== undefined) {
                    item.precio_unitario_facturado = skuPricingMap[item.sku];
                }
            });
        }
        
        res.json({ success: true, data });
    } catch (err) {
        console.error('[INVENTORY] Error al listar stock:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
