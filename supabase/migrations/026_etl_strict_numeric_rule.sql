-- Añadir regla de Validación Estricta Numérica al catálogo global

INSERT INTO public.reglas_limpieza (nombre_regla, tipo_regex, descripcion, es_global)
VALUES 
    (
        'Celda Estrictamente Numérica', 
        'VALIDATE_NUMERIC', 
        'Invalida (descarta) la celda entera si contiene al menos un carácter que no sea numérico. Sólo permite dígitos (0-9).', 
        true
    )
ON CONFLICT DO NOTHING;
