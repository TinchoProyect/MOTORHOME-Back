/**
 * Diagnostic Logger Service
 * Se encarga de formatear visualmente en consola los eventos de sistema para auditoría y depuración en tiempo real.
 */
class DiagnosticLogger {
    constructor() {
        this.enabled = true;
    }

    _formatPrefix(moduleName) {
        return `%c[ ${moduleName} ]`;
    }

    _getBaseStyle(color) {
        return `background: ${color}; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px;`;
    }

    log(moduleName, message, data = null) {
        if (!this.enabled) return;
        const color = '#3b82f6'; // blue-500
        if (data) {
            console.log(this._formatPrefix(moduleName) + ` %c${message}`, this._getBaseStyle(color), 'color: inherit;', data);
        } else {
            console.log(this._formatPrefix(moduleName) + ` %c${message}`, this._getBaseStyle(color), 'color: inherit;');
        }
    }

    success(moduleName, message, data = null) {
        if (!this.enabled) return;
        const color = '#10b981'; // emerald-500
        if (data) {
            console.log(this._formatPrefix(moduleName) + ` %c${message}`, this._getBaseStyle(color), 'color: inherit; font-weight: 500;', data);
        } else {
            console.log(this._formatPrefix(moduleName) + ` %c${message}`, this._getBaseStyle(color), 'color: inherit; font-weight: 500;');
        }
    }

    warn(moduleName, message, data = null) {
        if (!this.enabled) return;
        const color = '#f59e0b'; // amber-500
        if (data) {
            console.warn(this._formatPrefix(moduleName) + ` %c${message}`, this._getBaseStyle(color), 'color: inherit;', data);
        } else {
            console.warn(this._formatPrefix(moduleName) + ` %c${message}`, this._getBaseStyle(color), 'color: inherit;');
        }
    }

    error(moduleName, message, err = null) {
        if (!this.enabled) return;
        const color = '#ef4444'; // red-500
        if (err) {
            console.error(this._formatPrefix(moduleName) + ` %c${message}`, this._getBaseStyle(color), 'color: inherit;', err);
        } else {
            console.error(this._formatPrefix(moduleName) + ` %c${message}`, this._getBaseStyle(color), 'color: inherit;');
        }
    }

    state(message, data) {
        if (!this.enabled) return;
        const color = '#8b5cf6'; // violet-500
        console.groupCollapsed(this._formatPrefix("STATE") + ` %c${message}`, this._getBaseStyle(color), 'color: inherit;');
        console.table(data);
        console.trace("Rastro del estado llamado desde:");
        console.groupEnd();
    }
}

// Inyección e instanciado global
window.VigiaLogger = new DiagnosticLogger();
window.VigiaLogger.success("VIGIA", "Motor de auditoría de diagnóstico en tiempo real activado.");
