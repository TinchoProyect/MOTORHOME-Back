-- Script para inicializar Gestor de Plantillas de PDF (Supabase)
-- Ticket #006

CREATE TABLE public.pdf_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL, 
    template_name VARCHAR(255) NOT NULL,
    threshold_y INTEGER NOT NULL DEFAULT 6,
    threshold_x_merge INTEGER NOT NULL DEFAULT 8,
    col_tolerance INTEGER NOT NULL DEFAULT 15,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indices para busqueda rapida en el visor (Capa 3)
CREATE INDEX idx_pdf_templates_provider ON public.pdf_templates(provider_id);

-- Restricción Única: Evitar plantillas duplicadas con el mismo nombre para el mismo proveedor
ALTER TABLE public.pdf_templates ADD CONSTRAINT unique_template_name_per_provider UNIQUE (provider_id, template_name);

-- [Ticket #010] Soporte de Omisión de Columnas
ALTER TABLE public.pdf_templates ADD COLUMN omitted_columns JSONB DEFAULT '[]'::jsonb;
