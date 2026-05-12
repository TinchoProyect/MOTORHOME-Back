const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient'); // Assuming standard path

// GET: Obtener pedidos activos ('Emitido', 'Recepción Parcial') de un proveedor
router.get('/pedidos/:proveedorId', async (req, res) => {
    try {
        const { proveedorId } = req.params;
        
        const { data, error } = await supabase
            .from('pedidos_b2b_cabecera')
            .select(`
                id, fecha_emision, estado, notas_adjuntas
            `)
            .eq('proveedor_id', proveedorId)
            .in('estado', ['Emitido', 'Recepción Parcial'])
            .order('fecha_emision', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        console.error('[RECEPCION] Error al listar pedidos activos:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET: Obtener detalle del pedido con cálculo de cantidad_recibida previa
router.get('/pedido/:pedidoId/items', async (req, res) => {
    try {
        const { pedidoId } = req.params;
        
        // Obtenemos los ítems del pedido
        const { data: items, error: errorItems } = await supabase
            .from('pedidos_b2b_items')
            .select('*')
            .eq('pedido_id', pedidoId);
            
        if (errorItems) throw errorItems;

        // Obtenemos las recepciones previas para estos ítems (Excluyendo Anuladas)
        const { data: recepciones, error: errorRec } = await supabase
            .from('recepciones_fisicas_items')
            .select('pedido_item_id, cantidad_recibida, recepciones_fisicas_cabecera!inner(estado)')
            .in('pedido_item_id', items.map(i => i.id))
            .neq('recepciones_fisicas_cabecera.estado', 'Anulada');
            
        if (errorRec) throw errorRec;

        // Mapear historial
        const historyMap = {};
        recepciones.forEach(r => {
            if (!historyMap[r.pedido_item_id]) historyMap[r.pedido_item_id] = 0;
            historyMap[r.pedido_item_id] += Number(r.cantidad_recibida);
        });

        // Obtenemos el proveedor del pedido para consultar la tabla maestra operativa
        const { data: pedidoCb, error: errPed } = await supabase
            .from('pedidos_b2b_cabecera')
            .select('proveedor_id')
            .eq('id', pedidoId)
            .single();

        let factorMap = {};
        if (!errPed && pedidoCb) {
            const { data: masterData, error: errMaster } = await supabase
                .from('tabla_maestra_operativa')
                .select('datos_maestros')
                .eq('proveedor_id', pedidoCb.proveedor_id);

            if (!errMaster && masterData) {
                masterData.forEach(row => {
                    const dm = row.datos_maestros || {};
                    let codigo = dm.codigo || dm['código'] || dm.sku || dm.SKU;
                    if (!codigo) {
                        for (let k in dm) {
                            if (k.toLowerCase().includes('codigo') || k.toLowerCase().includes('código')) {
                                codigo = dm[k]; break;
                            }
                        }
                    }
                    if (codigo) {
                        let factor = 1;
                        let cantBult = 1;
                        let cantValor = 1;

                        const keyBult = Object.keys(dm).find(k => k.toLowerCase() === 'cant_bult' || k.toLowerCase() === 'cant_bulto');
                        if (keyBult) cantBult = parseFloat(String(dm[keyBult]).replace(',', '.')) || 1;

                        const keyValor = Object.keys(dm).find(k => k.toLowerCase() === 'cant_valor' || k.toLowerCase() === 'cant_unidad');
                        if (keyValor) cantValor = parseFloat(String(dm[keyValor]).replace(',', '.')) || 1;

                        factor = cantBult * cantValor;

                        if (factor === 1) {
                            for (let k in dm) {
                                const kt = k.toLowerCase();
                                if (kt.includes('presentacion') || kt.includes('presentación') || kt === 'peso') {
                                    const val = parseFloat(String(dm[k]).replace(',', '.'));
                                    if (!isNaN(val) && val > 0) { factor = val; break; }
                                }
                            }
                        }
                        factorMap[String(codigo).trim().toLowerCase()] = factor;
                    }
                });
            }
        }

        // Combinar datos
        const enrichedItems = items.map(item => {
            const cod = String(item.producto_codigo).trim().toLowerCase();
            return {
                ...item,
                cantidad_previa_recibida: historyMap[item.id] || 0,
                factor_conversion: factorMap[cod] || 1
            };
        });

        res.json({ success: true, data: enrichedItems });
    } catch (err) {
        console.error('[RECEPCION] Error al obtener ítems del pedido:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST: Registrar recepción física
router.post('/registrar', async (req, res) => {
    try {
        const { pedido_id, numero_remito, notas, items_recibidos } = req.body;
        
        if (!pedido_id || !items_recibidos || items_recibidos.length === 0) {
            return res.status(400).json({ success: false, error: 'Datos incompletos.' });
        }

        // 1. Insertar cabecera
        const { data: cabecera, error: errCabecera } = await supabase
            .from('recepciones_fisicas_cabecera')
            .insert({
                pedido_id,
                numero_remito,
                notas,
                estado: 'Calculando...' // Se actualiza despues
            })
            .select()
            .single();

        if (errCabecera) throw errCabecera;

        // 2. Insertar ítems
        const itemsToInsert = items_recibidos.map(item => ({
            recepcion_id: cabecera.id,
            pedido_item_id: item.pedido_item_id,
            cantidad_esperada: item.cantidad_esperada,
            cantidad_recibida: item.cantidad_recibida
        }));

        const { error: errItems } = await supabase
            .from('recepciones_fisicas_items')
            .insert(itemsToInsert);

        if (errItems) throw errItems;

        // 3. Evaluar el estado global del pedido
        // Volvemos a consultar todos los ítems y las recepciones totales
        const { data: allItems } = await supabase
            .from('pedidos_b2b_items')
            .select('id, cantidad')
            .eq('pedido_id', pedido_id);

        const { data: allRecepciones } = await supabase
            .from('recepciones_fisicas_items')
            .select('pedido_item_id, cantidad_recibida, recepciones_fisicas_cabecera!inner(estado)')
            .in('pedido_item_id', allItems.map(i => i.id))
            .neq('recepciones_fisicas_cabecera.estado', 'Anulada');

        let totalEsperado = 0;
        let totalRecibido = 0;

        const sumMap = {};
        allRecepciones.forEach(r => {
            if(!sumMap[r.pedido_item_id]) sumMap[r.pedido_item_id] = 0;
            sumMap[r.pedido_item_id] += Number(r.cantidad_recibida);
        });

        let incompleto = false;
        allItems.forEach(i => {
            const esperado = Number(i.cantidad);
            const recibido = sumMap[i.id] || 0;
            totalEsperado += esperado;
            totalRecibido += recibido;
            
            if (recibido < esperado) {
                incompleto = true;
            }
        });

        // Tolerancia a sobre-entregas: si totalRecibido >= totalEsperado y ningún ítem es incompleto
        const nuevoEstado = incompleto ? 'Recepción Parcial' : 'Recepción Completa';

        // 4. Actualizar estado del pedido original
        await supabase
            .from('pedidos_b2b_cabecera')
            .update({ estado: nuevoEstado })
            .eq('id', pedido_id);

        // 5. Actualizar estado de la cabecera de recepción
        await supabase
            .from('recepciones_fisicas_cabecera')
            .update({ estado: nuevoEstado })
            .eq('id', cabecera.id);

        res.json({ success: true, estado_final: nuevoEstado });

    } catch (err) {
        console.error('[RECEPCION] Error al registrar recepción:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET: Obtener historial de recepciones físicas
router.get('/historial', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('recepciones_fisicas_cabecera')
            .select(`
                id,
                fecha_recepcion,
                numero_remito,
                estado,
                estado_conciliacion,
                notas,
                pedido_id,
                pedidos_b2b_cabecera:pedido_id (
                    tipo_documento,
                    proveedor_id,
                    proveedores:proveedor_id (nombre)
                )
            `)
            .order('fecha_recepcion', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        console.error('[RECEPCION] Error al obtener historial:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET: Obtener recepciones de un proveedor específico
router.get('/provider/:proveedorId', async (req, res) => {
    try {
        const { proveedorId } = req.params;
        const { data, error } = await supabase
            .from('recepciones_fisicas_cabecera')
            .select(`
                id,
                fecha_recepcion,
                numero_remito,
                estado,
                pedido_id,
                pedidos_b2b_cabecera!inner(proveedor_id),
                recepciones_fisicas_items(
                    cantidad_recibida,
                    pedidos_b2b_items(producto_descripcion)
                )
            `)
            .eq('pedidos_b2b_cabecera.proveedor_id', proveedorId)
            .neq('estado', 'Anulada')
            .eq('estado_conciliacion', 'NO_CONCILIADA')
            .order('fecha_recepcion', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        console.error('[RECEPCION] Error al listar recepciones de proveedor:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET: Obtener ítems de una recepción específica
router.get('/historial/:recepcionId/items', async (req, res) => {
    try {
        const { recepcionId } = req.params;
        
        const { data, error } = await supabase
            .from('recepciones_fisicas_items')
            .select(`
                id,
                cantidad_esperada,
                cantidad_recibida,
                pedido_item_id,
                pedidos_b2b_items:pedido_item_id (
                    producto_codigo,
                    producto_descripcion,
                    unidad_ref
                )
            `)
            .eq('recepcion_id', recepcionId);
            
        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        console.error('[RECEPCION] Error al obtener ítems de recepción:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// POST: Anular recepción física (Soft-Delete)
router.post('/anular', async (req, res) => {
    try {
        const { recepcion_id, motivo } = req.body;
        
        if (!recepcion_id || !motivo) {
            return res.status(400).json({ success: false, error: 'Falta ID de recepción o motivo de anulación.' });
        }

        // 1. Obtener la recepción actual para saber el pedido_id
        const { data: recepcion, error: errGet } = await supabase
            .from('recepciones_fisicas_cabecera')
            .select('*')
            .eq('id', recepcion_id)
            .single();

        if (errGet) throw errGet;
        if (recepcion.estado === 'Anulada') {
            return res.status(400).json({ success: false, error: 'La recepción ya se encuentra anulada.' });
        }

        const nuevasNotas = (recepcion.notas ? recepcion.notas + ' | ' : '') + 'ANULADO: ' + motivo;

        // 2. Marcar como Anulada
        const { error: errUpdate } = await supabase
            .from('recepciones_fisicas_cabecera')
            .update({ estado: 'Anulada', notas: nuevasNotas })
            .eq('id', recepcion_id);

        if (errUpdate) throw errUpdate;

        // 3. Recalcular el estado del pedido original
        const pedido_id = recepcion.pedido_id;
        
        const { data: allItems } = await supabase
            .from('pedidos_b2b_items')
            .select('id, cantidad')
            .eq('pedido_id', pedido_id);

        const { data: allRecepciones } = await supabase
            .from('recepciones_fisicas_items')
            .select('pedido_item_id, cantidad_recibida, recepciones_fisicas_cabecera!inner(estado)')
            .in('pedido_item_id', allItems.map(i => i.id))
            .neq('recepciones_fisicas_cabecera.estado', 'Anulada');

        let incompleto = false;
        
        const sumMap = {};
        allRecepciones.forEach(r => {
            if(!sumMap[r.pedido_item_id]) sumMap[r.pedido_item_id] = 0;
            sumMap[r.pedido_item_id] += Number(r.cantidad_recibida);
        });

        allItems.forEach(i => {
            const esperado = Number(i.cantidad);
            const recibido = sumMap[i.id] || 0;
            if (recibido < esperado) {
                incompleto = true;
            }
        });

        // Si es incompleto, retrocede a 'Recepción Parcial' (o 'Emitido' si no hay otra recepción)
        let nuevoEstado = incompleto ? 'Recepción Parcial' : 'Recepción Completa';
        if (incompleto && allRecepciones.length === 0) {
            nuevoEstado = 'Emitido'; // No queda ninguna recepción válida
        }

        await supabase
            .from('pedidos_b2b_cabecera')
            .update({ estado: nuevoEstado })
            .eq('id', pedido_id);

        res.json({ success: true, estado_pedido: nuevoEstado });

    } catch (err) {
        console.error('[RECEPCION] Error al anular recepción:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST: Revertir recepción física (Hard-Delete)
router.post('/revertir', async (req, res) => {
    try {
        const { recepcion_id } = req.body;
        
        if (!recepcion_id) {
            return res.status(400).json({ success: false, error: 'Falta ID de recepción.' });
        }

        // 1. Obtener la recepción actual para saber el pedido_id
        const { data: recepcion, error: errGet } = await supabase
            .from('recepciones_fisicas_cabecera')
            .select('*')
            .eq('id', recepcion_id)
            .single();

        if (errGet || !recepcion) {
            return res.status(400).json({ success: false, error: 'Recepción no encontrada.' });
        }

        const pedido_id = recepcion.pedido_id;

        // 2. Eliminar físicamente los ítems de la recepción (Hard Delete)
        const { error: errItems } = await supabase
            .from('recepciones_fisicas_items')
            .delete()
            .eq('recepcion_id', recepcion_id);

        if (errItems) throw errItems;

        // 3. Eliminar físicamente la cabecera de la recepción (Hard Delete)
        const { error: errCabecera } = await supabase
            .from('recepciones_fisicas_cabecera')
            .delete()
            .eq('id', recepcion_id);

        if (errCabecera) throw errCabecera;

        // 4. Recalcular el estado del pedido original
        const { data: allItems } = await supabase
            .from('pedidos_b2b_items')
            .select('id, cantidad')
            .eq('pedido_id', pedido_id);

        const { data: allRecepciones } = await supabase
            .from('recepciones_fisicas_items')
            .select('pedido_item_id, cantidad_recibida, recepciones_fisicas_cabecera!inner(estado)')
            .in('pedido_item_id', allItems.map(i => i.id))
            .neq('recepciones_fisicas_cabecera.estado', 'Anulada');

        let incompleto = false;
        
        const sumMap = {};
        allRecepciones.forEach(r => {
            if(!sumMap[r.pedido_item_id]) sumMap[r.pedido_item_id] = 0;
            sumMap[r.pedido_item_id] += Number(r.cantidad_recibida);
        });

        allItems.forEach(i => {
            const esperado = Number(i.cantidad);
            const recibido = sumMap[i.id] || 0;
            if (recibido < esperado) {
                incompleto = true;
            }
        });

        // Si es incompleto, retrocede a 'Recepción Parcial' (o 'Emitido' si no hay otra recepción)
        let nuevoEstado = incompleto ? 'Recepción Parcial' : 'Recepción Completa';
        if (incompleto && allRecepciones.length === 0) {
            nuevoEstado = 'Emitido'; // No queda ninguna recepción válida
        }

        await supabase
            .from('pedidos_b2b_cabecera')
            .update({ estado: nuevoEstado })
            .eq('id', pedido_id);

        res.json({ success: true, estado_pedido: nuevoEstado });

    } catch (err) {
        console.error('[RECEPCION] Error al revertir recepción:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
