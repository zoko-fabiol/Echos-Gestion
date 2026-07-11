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
    try {
      const pdfBase64 = this.output('datauristring');
      const name = filename || 'document.pdf';
      downloadFileNative(pdfBase64, name)
        .then((status) => {
          console.log(`[jsPDF Patch] Saved native PDF: ${name} with status ${status}`);
        })
        .catch((err) => {
          console.error('[jsPDF Patch] Failed to save native PDF:', err);
        });
      return this;
    } catch (e) {
      console.warn('[jsPDF Patch] Error during native redirect, calling fallback save:', e);
      return (originalSave as any).call(this, filename, options);
    }
  };

  // 2. Intercept SheetJS (xlsx-js-style) writeFile calls to use native storage download
  const originalWriteFile = XLSXStyle.writeFile;
  (XLSXStyle as any).writeFile = function (wb: any, filename: string, o?: any) {
    try {
      const base64 = XLSXStyle.write(wb, { type: 'base64', bookType: 'xlsx', ...o });
      const base64Uri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
      downloadFileNative(base64Uri, filename)
        .then((status) => {
          console.log(`[XLSX Patch] Saved native Excel: ${filename} with status ${status}`);
        })
        .catch((err) => {
          console.error('[XLSX Patch] Failed to save native Excel:', err);
        });
    } catch (e) {
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
