import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import jsPDF from 'jspdf';
import XLSXStyle from 'xlsx-js-style';
import { isNativeApp, downloadFileNative } from './utils/capacitorUtils';

// --- CAPACITOR MOBILE WRAPPERS FOR EXPORTS ---
if (isNativeApp()) {
  // 1. Intercept jsPDF .save() calls to use native storage download
  const originalSave = jsPDF.prototype.save;
  (jsPDF.prototype as any).save = function (this: jsPDF, filename?: string, options?: any) {
    const name = filename || 'document.pdf';
    try {
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast(`Exportation du PDF en cours...`, 'info');
      }
      const pdfBase64 = this.output('datauristring');
      downloadFileNative(pdfBase64, name)
        .then((status) => {
          if (typeof (window as any).showToast === 'function') {
            if (status === 'saved') {
              (window as any).showToast(`PDF enregistré avec succès dans vos Documents !`, 'success');
            } else if (status === 'shared' || status === 'fallback_shared') {
              (window as any).showToast(`Feuille de partage ouverte pour enregistrer le PDF.`, 'success');
            } else {
              (window as any).showToast(`Impossible de sauvegarder le PDF.`, 'error');
            }
          }
          console.log(`[jsPDF Patch] Saved native PDF: ${name} with status ${status}`);
        })
        .catch((err) => {
          if (typeof (window as any).showToast === 'function') {
            (window as any).showToast(`Erreur d'export PDF : ${err.message || err}`, 'error');
          }
          console.error('[jsPDF Patch] Failed to save native PDF:', err);
        });
      return this;
    } catch (e: any) {
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast(`Erreur : Basculement sur l'export standard.`, 'warning');
      }
      console.warn('[jsPDF Patch] Error during native redirect, calling fallback save:', e);
      return (originalSave as any).call(this, filename, options);
    }
  };

  // 2. Intercept SheetJS (xlsx-js-style) writeFile calls to use native storage download
  const originalWriteFile = XLSXStyle.writeFile;
  (XLSXStyle as any).writeFile = function (wb: any, filename: string, o?: any) {
    try {
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast(`Exportation Excel en cours...`, 'info');
      }
      const base64 = XLSXStyle.write(wb, { type: 'base64', bookType: 'xlsx', ...o });
      const base64Uri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
      downloadFileNative(base64Uri, filename)
        .then((status) => {
          if (typeof (window as any).showToast === 'function') {
            if (status === 'saved') {
              (window as any).showToast(`Excel enregistré avec succès dans vos Documents !`, 'success');
            } else if (status === 'shared' || status === 'fallback_shared') {
              (window as any).showToast(`Feuille de partage ouverte pour enregistrer l'Excel.`, 'success');
            } else {
              (window as any).showToast(`Impossible de sauvegarder l'Excel.`, 'error');
            }
          }
          console.log(`[XLSX Patch] Saved native Excel: ${filename} with status ${status}`);
        })
        .catch((err) => {
          if (typeof (window as any).showToast === 'function') {
            (window as any).showToast(`Erreur d'export Excel : ${err.message || err}`, 'error');
          }
          console.error('[XLSX Patch] Failed to save native Excel:', err);
        });
    } catch (e: any) {
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast(`Erreur : Basculement sur l'export Excel standard.`, 'warning');
      }
      console.warn('[XLSX Patch] Error during native redirect, calling fallback writeFile:', e);
      (originalWriteFile as any)(wb, filename, o);
    }
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
