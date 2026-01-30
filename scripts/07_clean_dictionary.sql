-- =============================================================================
-- SCRIPT 07: LIMPIEZA TABULA RASA
-- Objetivo: Eliminar seeds del sistema para que el usuario empiece de cero.
-- =============================================================================

-- Eliminar todos los registros actuales (Reset total)
TRUNCATE TABLE user_diccionario_nomenclatura;

-- Opcional: Si quisieras mantener SOLO lo custom:
-- DELETE FROM user_diccionario_nomenclatura WHERE categoria = 'SYSTEM';

-- Confirmar limpieza
SELECT COUNT(*) as terminos_restantes FROM user_diccionario_nomenclatura;
