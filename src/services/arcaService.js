const fs = require('fs');
const forge = require('node-forge');
const axios = require('axios');
const xml2js = require('xml2js');

class ArcaService {
    constructor() {
        this.initialized = false;
        this.cuit = null;
        this.certContent = null;
        this.keyContent = null;
        this.production = false;
        
        // Cache variables
        this.tokenCache = null;
        this.signCache = null;
        this.cacheExpiration = null; // Date object
    }

    init() {
        if (this.initialized) return;

        const cuit = process.env.ARCA_CUIT;
        const certPath = process.env.ARCA_CERT_PATH;
        const keyPath = process.env.ARCA_KEY_PATH;
        const production = process.env.ARCA_PRODUCTION === 'true';

        if (!cuit || !certPath || !keyPath) {
            console.warn('[ARCA] Advertencia: Credenciales ARCA incompletas en .env. El servicio Padrón A13 estará deshabilitado.');
            return;
        }

        try {
            if (!fs.existsSync(certPath)) throw new Error(`Certificado no encontrado en ${certPath}`);
            if (!fs.existsSync(keyPath)) throw new Error(`Llave privada no encontrada en ${keyPath}`);
            
            this.certContent = fs.readFileSync(certPath, 'utf8');
            this.keyContent = fs.readFileSync(keyPath, 'utf8');
            this.cuit = parseInt(cuit, 10);
            this.production = production;

            this.initialized = true;
            console.log('[ARCA NATIVO] Motor Criptográfico CMS Inicializado Correctamente. Modo Seguro Local.');
        } catch (error) {
            console.error('[ARCA NATIVO] Error inicializando Motor:', error.message);
        }
    }

    /**
     * Parse XML to JSON helper
     */
    async parseXml(xmlStr) {
        return new Promise((resolve, reject) => {
            xml2js.parseString(xmlStr, { explicitArray: false }, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    }

    /**
     * Genera y firma el Ticket de Acceso (TA)
     */
    async getTA(service = 'ws_sr_padron_a13') {
        // Verificar Caché (Expira en 12h, usamos 10h de margen de seguridad)
        if (this.tokenCache && this.signCache && this.cacheExpiration && new Date() < this.cacheExpiration) {
            return { token: this.tokenCache, sign: this.signCache };
        }

        console.log(`[ARCA NATIVO] Generando nuevo Ticket de Acceso (WSAA) para el servicio ${service}...`);

        // 1. Crear el LoginTicketRequest XML
        const now = new Date();
        const genTime = new Date(now.getTime() - 10 * 60000).toISOString(); // -10 min para desajustes NTP
        const expTime = new Date(now.getTime() + 12 * 3600000).toISOString(); // +12 horas
        const uniqueId = Math.floor(now.getTime() / 1000);

        const xmlTRA = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${genTime}</generationTime>
    <expirationTime>${expTime}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`;

        // 2. Criptografía PKCS#7 (CMS)
        const p7 = forge.pkcs7.createSignedData();
        p7.content = forge.util.createBuffer(xmlTRA, 'utf8');
        
        const cert = forge.pki.certificateFromPem(this.certContent);
        p7.addCertificate(cert);
        
        const privateKey = forge.pki.privateKeyFromPem(this.keyContent);
        p7.addSigner({
            key: privateKey,
            certificate: cert,
            digestAlgorithm: forge.pki.oids.sha256,
            authenticatedAttributes: [
                { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
                { type: forge.pki.oids.messageDigest },
                { type: forge.pki.oids.signingTime }
            ]
        });

        p7.sign();
        const cmsSigned = forge.pkcs7.messageToPem(p7);
        // Extraer base64 del PEM y quitar headers
        const cmsBase64 = cmsSigned.replace(/-----BEGIN PKCS7-----/g, '').replace(/-----END PKCS7-----/g, '').replace(/\r?\n/g, '');

        // 3. Empaquetar en SOAP Envelope
        const soapWSAA = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desas.afip.gov">
   <soapenv:Header/>
   <soapenv:Body>
      <wsaa:loginCms>
         <wsaa:in0>${cmsBase64}</wsaa:in0>
      </wsaa:loginCms>
   </soapenv:Body>
</soapenv:Envelope>`;

        // 4. Enviar a AFIP
        const wsaaUrl = this.production ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms' : 'https://wsaa.afip.gov.ar/ws/services/LoginCms'; // Producción
        
        try {
            const wsaaResponse = await axios.post(wsaaUrl, soapWSAA, {
                headers: { 
                    'Content-Type': 'text/xml;charset=UTF-8',
                    'SOAPAction': ''
                }
            });

            // 5. Extraer Token y Sign de la respuesta XML de AFIP
            const wsaaJson = await this.parseXml(wsaaResponse.data);
            const loginCmsReturnStr = wsaaJson['soapenv:Envelope']['soapenv:Body']['loginCmsResponse']['loginCmsReturn'];
            const ticketJson = await this.parseXml(loginCmsReturnStr);

            this.tokenCache = ticketJson.loginTicketResponse.credentials.token;
            this.signCache = ticketJson.loginTicketResponse.credentials.sign;
            // Guardar expiración -1 hora de margen de seguridad (el TA dura 12 horas)
            this.cacheExpiration = new Date(new Date().getTime() + 11 * 3600000); 

            console.log('[ARCA NATIVO] Ticket de Acceso (WSAA) Obtenido y Cacheado exitosamente.');
            return { token: this.tokenCache, sign: this.signCache };
        } catch (error) {
            console.error('[ARCA NATIVO] Error crítico en WSAA:', error.message);
            if (error.response && error.response.data) {
                console.error("Detalles SOAP Fault WSAA:", error.response.data);
            }
            throw new Error("No Autorizado o Credenciales de Sistema Inválidas en AFIP WSAA.");
        }
    }

    /**
     * Consulta el Padrón A13
     */
    async getProveedorData(cuitTarget) {
        if (!this.initialized) {
            this.init();
            if (!this.initialized) {
                return {
                    success: false,
                    error: 'El motor local de ARCA no está configurado (Certificados no accesibles o CUIT inválido).'
                };
            }
        }

        try {
            const { token, sign } = await this.getTA('ws_sr_padron_a13');
            console.log(`[ARCA NATIVO] Consultando ws_sr_padron_a13 para CUIT objetivo: ${cuitTarget}...`);

            const wsUrl = this.production ? 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13' : 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13';

            // SOAP Request para getPersona
            const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a13="http://a13.soap.ws.server.puc.sr/">
   <soapenv:Header/>
   <soapenv:Body>
      <a13:getPersona>
         <token>${token}</token>
         <sign>${sign}</sign>
         <cuitRepresentada>${this.cuit}</cuitRepresentada>
         <idPersona>${cuitTarget}</idPersona>
      </a13:getPersona>
   </soapenv:Body>
</soapenv:Envelope>`;

            const wsResponse = await axios.post(wsUrl, soapRequest, {
                headers: { 'Content-Type': 'text/xml;charset=UTF-8' }
            });

            console.log("Raw WS Response:", wsResponse.data);
            const wsJson = await this.parseXml(wsResponse.data);
            
            // Navegar JSON convertido
            const envelope = wsJson['soap:Envelope'] || wsJson['soapenv:Envelope'] || wsJson['Envelope'];
            const body = envelope['soap:Body'] || envelope['soapenv:Body'] || envelope['Body'];
            
            if (body['soap:Fault'] || body['soapenv:Fault'] || body['Fault']) {
                const fault = body['soap:Fault'] || body['soapenv:Fault'] || body['Fault'];
                throw new Error(fault['faultstring'] || 'Error SOAP desconocido');
            }

            const responseWrapper = body['ns2:getPersonaResponse'] || body['getPersonaResponse'];
            const returnData = responseWrapper['personaReturn'] || responseWrapper['return'];
            
            if (!returnData || (!returnData.datosGenerales && !returnData.persona)) {
                throw new Error('No se encontraron datos para este CUIT en ARCA.');
            }

            const taxpayer = returnData.datosGenerales || returnData.persona;
            const status = taxpayer.estadoClave;
            
            let domicilioCompleto = '';
            let localidad = '';
            let provincia = '';

            let dom = null;
            if (taxpayer.domicilioFiscal) {
                dom = taxpayer.domicilioFiscal;
            } else if (taxpayer.domicilio) {
                const doms = Array.isArray(taxpayer.domicilio) ? taxpayer.domicilio : [taxpayer.domicilio];
                dom = doms.find(d => d.tipoDomicilio && (d.tipoDomicilio.includes('FISCAL') || d.tipoDomicilio === 'LEGAL/REAL')) || doms[0];
            }

            if (dom) {
                const calle = dom.direccion || dom.calle || '';
                const numero = dom.numero ? ` ${dom.numero}` : '';
                const cp = (dom.codPostal || dom.codigoPostal) ? ` (CP: ${dom.codPostal || dom.codigoPostal})` : '';
                localidad = dom.localidad || '';
                provincia = dom.descripcionProvincia || '';
                
                domicilioCompleto = [(calle + numero).trim(), localidad, provincia, cp].filter(Boolean).join(', ').replace(',  (CP', ' (CP');
            }

            const razonSocial = taxpayer.razonSocial || (taxpayer.apellido + ' ' + taxpayer.nombre);

            return {
                success: true,
                cuit: cuitTarget,
                razonSocial: razonSocial,
                domicilio: domicilioCompleto || 'Sin domicilio registrado',
                localidad: localidad,
                provincia: provincia,
                estado: status,
                rawData: returnData
            };

        } catch (error) {
            console.error('[ARCA NATIVO] Error consultando ws_sr_padron_a13:', error.message);
            
            let userMsg = 'Error comunicándose con el Padrón ARCA.';
            if (error.message && error.message.includes('No existe')) {
                userMsg = 'El CUIT ingresado no existe en el Padrón ARCA.';
            } else if (error.message && error.message.includes('Autorizado')) {
                userMsg = 'Error de Autorización (WSAA Ticket o Permisos de Delegación AFIP).';
            }

            return {
                success: false,
                error: userMsg,
                details: error.message
            };
        }
    }
}

module.exports = new ArcaService();
