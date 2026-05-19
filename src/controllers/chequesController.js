const chequesIngestService = require('../services/chequesIngestService');
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

exports.getConfig = async (req, res) => {
    try {
        let folderId = process.env.DRIVE_CHEQUES_FOLDER_ID;

        // Buscar en configuracion_sistema si no está en entorno
        if (!folderId) {
            const { data } = await supabase
                .from('configuracion_sistema')
                .select('valor')
                .eq('llave', 'drive_cheques_folder_id')
                .single();
            if (data && data.valor) {
                folderId = data.valor;
            }
        }

        // Auto-aprovisionamiento
        if (!folderId) {
            const driveService = require('../services/driveService');
            const parentId = process.env.DRIVE_FOLDER_ID; // Root
            
            if (!parentId) {
                throw new Error("Falta configurar DRIVE_FOLDER_ID raíz en el servidor para crear la carpeta.");
            }

            const newFolder = await driveService.createFolder('Ingesta_Cheques_CSV', parentId);
            folderId = newFolder.id;

            await supabase
                .from('configuracion_sistema')
                .upsert({ 
                    llave: 'drive_cheques_folder_id', 
                    valor: folderId,
                    descripcion: 'ID de la carpeta en Drive para la ingesta de Cheques.',
                    updated_at: new Date()
                }, { onConflict: 'llave' });
        }

        let folderEndososId = process.env.DRIVE_CSV_ENDOSOS_ID;
        if (!folderEndososId) {
            const { data: dataEndosos } = await supabase
                .from('configuracion_sistema')
                .select('valor')
                .eq('llave', 'drive_endosos_folder_id')
                .single();
            if (dataEndosos && dataEndosos.valor) {
                folderEndososId = dataEndosos.valor;
            }
        }
        if (!folderEndososId) {
            const driveService = require('../services/driveService');
            const parentId = process.env.DRIVE_FOLDER_ID; // Root
            if (parentId) {
                const newFolderEndosos = await driveService.createFolder('Ingesta_Cheques_Endosados_CSV', parentId);
                folderEndososId = newFolderEndosos.id;

                await supabase
                    .from('configuracion_sistema')
                    .upsert({ 
                        llave: 'drive_endosos_folder_id', 
                        valor: folderEndososId,
                        descripcion: 'ID de la carpeta en Drive para la ingesta de Cheques Endosados.',
                        updated_at: new Date()
                    }, { onConflict: 'llave' });
            }
        }

        res.json({ success: true, folderId, folderEndososId });
    } catch (error) {
        console.error("[ChequesController] Error getConfig:", error);
        res.status(500).json({ success: false, message: "Error interno al recuperar la configuración de carpetas." });
    }
};

exports.getDisponibles = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('cheques_cartera')
            .select('*')
            .eq('estado_interno', 'EN_CARTERA')
            .order('fecha_vencimiento_calculada', { ascending: true });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        console.error("[ChequesController] Error getDisponibles:", error);
        res.status(500).json({ success: false, message: "Error interno al recuperar los cheques en cartera." });
    }
};

exports.getTodos = async (req, res) => {
    try {
        const { data: cheques, error } = await supabase
            .from('cheques_cartera')
            .select('*')
            .order('fecha_pago', { ascending: false });

        if (error) throw error;

        // Acoplamiento permisivo (Left Join en Memoria) para proteger contra errores de relaciones en Supabase
        const { data: proveedores } = await supabase
            .from('proveedores')
            .select('id, nombre, afip_razon_social');
            
        const provMap = new Map();
        if (proveedores) {
            proveedores.forEach(p => provMap.set(p.id, p));
        }

        const data = cheques.map(c => {
            if (c.proveedor_endosado_id) {
                c.proveedor_endosado = provMap.get(c.proveedor_endosado_id) || null;
            } else {
                c.proveedor_endosado = null;
            }
            return c;
        });

        res.json({ success: true, data });
    } catch (error) {
        console.error("[ChequesController] Error getTodos:", error);
        res.status(500).json({ success: false, message: "Error interno al recuperar el histórico de cheques. Revise la consola del servidor." });
    }
};

exports.ingestarDrive = async (req, res) => {
    try {
        const result = await chequesIngestService.startDriveIngestion();
        res.json({ success: true, ...result });
    } catch (error) {
        console.error("[ChequesController] Error ingestarDrive:", error);
        res.status(500).json({ success: false, message: "Error interno durante la ingesta de cheques." });
    }
};

exports.ingestarEndososDrive = async (req, res) => {
    try {
        const result = await chequesIngestService.startEndososIngestion();
        res.json({ success: true, ...result });
    } catch (error) {
        console.error("[ChequesController] Error ingestarEndososDrive:", error);
        res.status(500).json({ success: false, message: "Error interno durante la conciliación de endosos." });
    }
};

exports.endosar = async (req, res) => {
    const { id } = req.params;
    const { proveedor_id } = req.body;
    try {
        // Validación de proveedor y cheque existente, actualizar a ENDOSADO
        // [WARNING]: Integrar aquí la llamada al módulo de cuenta corriente para impactar pago.
        const { data, error } = await supabase
            .from('cheques_cartera')
            .update({ 
                estado_interno: 'ENDOSADO',
                proveedor_endosado_id: proveedor_id,
                fecha_endoso: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data, message: "Cheque endosado con éxito" });
    } catch (error) {
        console.error("[ChequesController] Error endosar:", error);
        res.status(500).json({ success: false, message: "Error interno al registrar el endoso del cheque." });
    }
};

exports.acreditar = async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('cheques_cartera')
            .update({ 
                estado_interno: 'ACREDITADO',
                fecha_deposito: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data, message: "Cheque acreditado con éxito" });
    } catch (error) {
        console.error("[ChequesController] Error acreditar:", error);
        res.status(500).json({ success: false, message: "Error interno al acreditar el cheque." });
    }
};

exports.rechazar = async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('cheques_cartera')
            .update({ estado_interno: 'DEVUELTO' })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data, message: "Cheque devuelto/rechazado" });
    } catch (error) {
        console.error("[ChequesController] Error rechazar:", error);
        res.status(500).json({ success: false, message: "Error interno al registrar el rechazo del cheque." });
    }
};

exports.purge = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('cheques_cartera')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

        if (error) throw error;
        res.json({ success: true, message: "Base de datos de cheques vaciada correctamente." });
    } catch (error) {
        console.error("[ChequesController] Error purge:", error);
        res.status(500).json({ success: false, message: "Error interno al purgar la base de datos." });
    }
};

exports.exportarPDFCheques = async (req, res) => {
    try {
        const { ids, proveedor_id } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'No se enviaron IDs de cheques.' });
        }
        if (!proveedor_id) {
            return res.status(400).json({ success: false, message: 'No se seleccionó un proveedor destinatario.' });
        }

        const { data: cheques, error } = await supabase
            .from('cheques_cartera')
            .select('*')
            .in('id', ids)
            .order('fecha_vencimiento_calculada', { ascending: true });

        if (error) throw error;
        if (!cheques || cheques.length === 0) {
            return res.status(404).json({ success: false, message: 'No se encontraron los cheques.' });
        }

        const { data: proveedor, error: provError } = await supabase
            .from('proveedores')
            .select('nombre, afip_razon_social, cuit')
            .eq('id', proveedor_id)
            .single();

        if (provError) throw provError;
        const nombreProveedor = proveedor ? (proveedor.nombre || proveedor.afip_razon_social || 'Desconocido') : 'Desconocido';
        const cuitProveedor = (proveedor && proveedor.cuit) ? ` - ${proveedor.cuit}` : '';

        let totalImporte = 0;
        let filasHtml = '';
        const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
        
        const hoy = new Date();
        hoy.setHours(0,0,0,0);

        cheques.forEach(c => {
            totalImporte += c.importe;
            
            let vencText = c.fecha_vencimiento_calculada || 'N/A';
            if (c.fecha_vencimiento_calculada) {
                const fVenc = new Date(c.fecha_vencimiento_calculada + 'T00:00:00');
                const diffTime = fVenc.getTime() - hoy.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                vencText = diffDays.toString();
            }

            let estadoLiquidez = '';
            if (c.fecha_pago) {
                const fPago = new Date(c.fecha_pago + 'T00:00:00');
                if (fPago.getTime() <= hoy.getTime()) {
                    estadoLiquidez = '<br><span style="color: #10b981; font-weight: bold; font-size: 10px;">✔ Al cobro</span>';
                }
            }

            filasHtml += `
                <tr>
                    <td>${c.numero_cheque}</td>
                    <td>${c.librador_razon_social}</td>
                    <td>${c.librador_cuit}</td>
                    <td>${c.banco_emisor}</td>
                    <td class="text-center" style="vertical-align: middle;">${vencText}${estadoLiquidez}</td>
                    <td class="text-right font-bold" style="vertical-align: middle;">${formatter.format(c.importe)}</td>
                </tr>
            `;
        });

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 40px; }
                    .header { border-bottom: 2px solid #8b5cf6; padding-bottom: 15px; margin-bottom: 30px; }
                    .header h1 { margin: 0; color: #0f172a; font-size: 24px; }
                    .header p { margin: 5px 0 0 0; color: #64748b; font-size: 14px; }
                    table { border-collapse: collapse; width: 100%; font-size: 12px; margin-bottom: 30px; }
                    th { background-color: #f8fafc; color: #475569; padding: 10px; text-align: left; border-bottom: 2px solid #cbd5e1; }
                    td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
                    .text-right { text-align: right; }
                    .text-center { text-align: center; }
                    .font-bold { font-weight: bold; }
                    .total-box { background-color: #f1f5f9; padding: 20px; border-radius: 8px; border-left: 4px solid #8b5cf6; }
                    .total-box h2 { margin: 0 0 10px 0; font-size: 16px; color: #334155; }
                    .total-row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 5px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Informe de Valores Electrónicos (E-Cheqs) Disponibles para Endoso</h1>
                    <p>LAMDA Sistema de Gestión - Emitido el: ${new Date().toLocaleString('es-AR')}</p>
                    <p style="margin-top: 10px; color: #8b5cf6; font-weight: bold; font-size: 15px;">Destinatario / Propuesta para el Proveedor: ${nombreProveedor}${cuitProveedor}</p>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th>Nº Cheque</th>
                            <th>Razón Social (Librador)</th>
                            <th>CUIT</th>
                            <th>Banco Emisor</th>
                            <th class="text-center">Ven. (Días)</th>
                            <th class="text-right">Importe</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filasHtml}
                    </tbody>
                </table>

                <div class="total-box">
                    <h2>Resumen del Paquete Financiero</h2>
                    <div class="total-row">
                        <span style="display:inline-block; width: 80%;">Cantidad Total de Cheques:</span>
                        <span class="font-bold text-right" style="display:inline-block; width: 19%;">${cheques.length}</span>
                    </div>
                    <div class="total-row">
                        <span style="display:inline-block; width: 80%;">Valor Total Consolidado:</span>
                        <span class="font-bold text-right" style="color: #8b5cf6; font-size: 16px; display:inline-block; width: 19%;">${formatter.format(totalImporte)}</span>
                    </div>
                </div>
            </body>
            </html>
        `;

        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="Informe_Cheques_Disponibles.pdf"'
        });
        res.send(Buffer.from(pdfBuffer));

    } catch (error) {
        console.error("[ChequesController] Error exportarPDFCheques:", error);
        res.status(500).json({ success: false, message: "Error interno al generar el reporte PDF de cheques disponibles." });
    }
};

exports.exportarPDFEndosados = async (req, res) => {
    try {
        const { ids, proveedor_id } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'No se enviaron IDs de cheques.' });
        }
        if (!proveedor_id) {
            return res.status(400).json({ success: false, message: 'No se seleccionó un proveedor destinatario.' });
        }

        const { data: cheques, error } = await supabase
            .from('cheques_cartera')
            .select('*')
            .in('id', ids)
            .order('fecha_pago', { ascending: true });

        if (error) throw error;
        if (!cheques || cheques.length === 0) {
            return res.status(404).json({ success: false, message: 'No se encontraron los cheques.' });
        }

        const { data: proveedor, error: provError } = await supabase
            .from('proveedores')
            .select('nombre, afip_razon_social, cuit')
            .eq('id', proveedor_id)
            .single();

        if (provError) throw provError;
        const nombreProveedor = proveedor ? (proveedor.nombre || proveedor.afip_razon_social || 'Desconocido') : 'Desconocido';
        const cuitProveedor = (proveedor && proveedor.cuit) ? ` - ${proveedor.cuit}` : '';

        let totalImporte = 0;
        let filasHtml = '';
        const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

        cheques.forEach(c => {
            totalImporte += c.importe;
            
            const fEmision = c.fecha_emision ? new Date(c.fecha_emision + 'T00:00:00').toLocaleDateString('es-AR') : 'N/A';
            const fPago = c.fecha_pago ? new Date(c.fecha_pago + 'T00:00:00').toLocaleDateString('es-AR') : 'N/A';

            filasHtml += `
                <tr>
                    <td>${c.numero_cheque}</td>
                    <td>${c.librador_razon_social}</td>
                    <td>${c.librador_cuit}</td>
                    <td>${c.banco_emisor}</td>
                    <td class="text-center">${fEmision}</td>
                    <td class="text-center">${fPago}</td>
                    <td class="text-right font-bold">${formatter.format(c.importe)}</td>
                </tr>
            `;
        });

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 40px; }
                    .header { border-bottom: 2px solid #8b5cf6; padding-bottom: 15px; margin-bottom: 30px; }
                    .header h1 { margin: 0; color: #0f172a; font-size: 24px; }
                    .header p { margin: 5px 0 0 0; color: #64748b; font-size: 14px; }
                    table { border-collapse: collapse; width: 100%; font-size: 12px; margin-bottom: 30px; }
                    th { background-color: #f8fafc; color: #475569; padding: 10px; text-align: left; border-bottom: 2px solid #cbd5e1; }
                    td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
                    .text-right { text-align: right; }
                    .text-center { text-align: center; }
                    .font-bold { font-weight: bold; }
                    .total-box { background-color: #f1f5f9; padding: 20px; border-radius: 8px; border-left: 4px solid #8b5cf6; }
                    .total-box h2 { margin: 0 0 10px 0; font-size: 16px; color: #334155; }
                    .total-row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 5px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Comprobante de Confirmación: E-Cheqs Endosados</h1>
                    <p>LAMDA Sistema de Gestión - Emitido el: ${new Date().toLocaleString('es-AR')}</p>
                    <p style="margin-top: 10px; color: #8b5cf6; font-weight: bold; font-size: 15px;">Destinatario: ${nombreProveedor}${cuitProveedor}</p>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th>Nº Cheque</th>
                            <th>Emisor Original</th>
                            <th>CUIT Emisor</th>
                            <th>Banco</th>
                            <th class="text-center">F. Emisión</th>
                            <th class="text-center">F. Pago</th>
                            <th class="text-right">Importe</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filasHtml}
                    </tbody>
                </table>

                <div class="total-box">
                    <h2>Resumen del Paquete Transferido</h2>
                    <div class="total-row">
                        <span style="display:inline-block; width: 80%;">Cantidad Total de Cheques:</span>
                        <span class="font-bold text-right" style="display:inline-block; width: 19%;">${cheques.length}</span>
                    </div>
                    <div class="total-row">
                        <span style="display:inline-block; width: 80%;">Valor Total Consolidado:</span>
                        <span class="font-bold text-right" style="color: #8b5cf6; font-size: 16px; display:inline-block; width: 19%;">${formatter.format(totalImporte)}</span>
                    </div>
                </div>
            </body>
            </html>
        `;

        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="Comprobante_Endosos.pdf"'
        });
        res.send(Buffer.from(pdfBuffer));

    } catch (error) {
        console.error("[ChequesController] Error exportarPDFEndosados:", error);
        res.status(500).json({ success: false, message: "Error interno al generar el reporte PDF de confirmación de endosos." });
    }
};
