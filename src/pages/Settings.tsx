import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAuth } from '../context/AuthContext';
import { 
  Settings, Palette, Shield, Building2, Upload, 
  Trash2, Save, Key, Lock, Eye, EyeOff, RefreshCw,
  Database, Download
} from 'lucide-react';
import { 
  LOGO_KEY, THEME_COLOR_KEY, COMPANY_KEY, DEFAULT_THEME_COLOR, 
  DEFAULT_COMPANY_INFO, CompanyInfo 
} from '../config/constants';
import { showToast } from '../components/ui/Toast';
import { syncUp, getLatestOdooSyncLog } from '../services/syncEngine';
import { backupToJSON, restoreFromJSON, importEmployeesFromCSV } from '../services/backupService';

export const SettingsPage: React.FC = () => {
  const { currentUser, securitySettings, saveSecuritySettings, saveSecurityPin } = useAuth();
  
  // Settings loaded from DB
  const logoRecord = useLiveQuery(() => db.appSettings.get(LOGO_KEY));
  const colorRecord = useLiveQuery(() => db.appSettings.get(THEME_COLOR_KEY));
  const companyRecord = useLiveQuery(() => db.appSettings.get(COMPANY_KEY));
  const glassEnabledRecord = useLiveQuery(() => db.appSettings.get('theme_glass_enabled'));
  const glassOpacityRecord = useLiveQuery(() => db.appSettings.get('theme_glass_opacity'));

  // Odoo Logs State
  const [odooLog, setOdooLog] = useState<any | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);

  // Form states - Branding
  const [brandColor, setBrandColor] = useState(DEFAULT_THEME_COLOR);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [glassEnabled, setGlassEnabled] = useState(false);
  const [glassOpacity, setGlassOpacity] = useState(0.15);

  // Form states - Company Info
  const [compName, setCompName] = useState(DEFAULT_COMPANY_INFO.name);
  const [compContact, setCompContact] = useState(DEFAULT_COMPANY_INFO.contact);
  const [compFooter, setCompFooter] = useState(DEFAULT_COMPANY_INFO.footer);

  // Form states - Lock Screen Security
  const [pinEnabled, setPinEnabled] = useState(false);
  const [inactivityDelay, setInactivityDelay] = useState(5);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPinInputs, setShowPinInputs] = useState(false);

  // Load values
  useEffect(() => {
    if (colorRecord?.value) {
      setBrandColor(colorRecord.value);
    }
    if (logoRecord?.value) {
      setLogoBase64(logoRecord.value);
    }
    if (companyRecord?.value) {
      const info = companyRecord.value as CompanyInfo;
      setCompName(info.name || '');
      setCompContact(info.contact || '');
      setCompFooter(info.footer || '');
    }
    if (glassEnabledRecord) {
      setGlassEnabled(glassEnabledRecord.value === true);
    }
    if (glassOpacityRecord) {
      setGlassOpacity(glassOpacityRecord.value ?? 0.15);
    }
  }, [colorRecord, logoRecord, companyRecord, glassEnabledRecord, glassOpacityRecord]);

  // Load Security Settings
  useEffect(() => {
    setPinEnabled(securitySettings.pinEnabled);
    setInactivityDelay(securitySettings.inactivityDelay);
  }, [securitySettings]);

  // Load Odoo Logs
  const fetchOdooLogs = async () => {
    setLoadingLog(true);
    try {
      const log = await getLatestOdooSyncLog();
      setOdooLog(log);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoadingLog(false);
    }
  };

  useEffect(() => {
    fetchOdooLogs();
  }, []);

  // --- BRANDING ACTIONS ---

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800 * 1024) {
      showToast('Le logo ne doit pas dépasser 800 Ko.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setLogoBase64(base64);
      await db.appSettings.put({ key: LOGO_KEY, value: base64, timestamp: Date.now() });
      showToast('Logo de marque mis à jour avec succès.', 'success');
      syncUp().catch(err => console.warn('Background sync failed', err));
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = async () => {
    setLogoBase64(null);
    await db.appSettings.delete(LOGO_KEY);
    showToast('Logo supprimé.', 'success');
    syncUp().catch(err => console.warn('Background sync failed', err));
  };

  const saveBrandingColor = async (color: string) => {
    setBrandColor(color);
    await db.appSettings.put({ key: THEME_COLOR_KEY, value: color, timestamp: Date.now() });
    
    // Dynamically apply style property
    document.documentElement.style.setProperty('--brand-color', color);
    showToast('Couleur de marque appliquée !', 'success');
    syncUp().catch(err => console.warn('Background sync failed', err));
  };

  const saveGlassmorphismSettings = async (enabled: boolean, opacity: number) => {
    setGlassEnabled(enabled);
    setGlassOpacity(opacity);
    await db.appSettings.put({ key: 'theme_glass_enabled', value: enabled, timestamp: Date.now() });
    await db.appSettings.put({ key: 'theme_glass_opacity', value: opacity, timestamp: Date.now() });
    showToast('Thème glassmorphic mis à jour.', 'success');
    syncUp().catch(err => console.warn('Background sync failed', err));
  };

  const saveGlassmorphismSettingsSilent = async (enabled: boolean, opacity: number) => {
    setGlassEnabled(enabled);
    setGlassOpacity(opacity);
    await db.appSettings.put({ key: 'theme_glass_enabled', value: enabled, timestamp: Date.now() });
    await db.appSettings.put({ key: 'theme_glass_opacity', value: opacity, timestamp: Date.now() });
    syncUp().catch(err => console.warn('Background sync failed', err));
  };

  // --- COMPANY ACTIONS ---

  const saveCompanyDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    const info: CompanyInfo = {
      name: compName.trim(),
      contact: compContact.trim(),
      footer: compFooter.trim()
    };

    await db.appSettings.put({ key: COMPANY_KEY, value: info, timestamp: Date.now() });
    showToast('Informations d\'entreprise sauvegardées.', 'success');
    syncUp().catch(err => console.warn('Background sync failed', err));
  };

  // --- ADMIN BACKUP / IMPORT ACTIONS ---

  const handleExportJSON = async () => {
    try {
      await backupToJSON();
      showToast('Export de la base réussi.', 'success');
    } catch (e: any) {
      showToast(e.message || 'Export échoué.', 'error');
    }
  };

  const handleJSONRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);

        const isRH = !!(data.employees || data.attendance || data.payrollExtras);
        const isFull = !!(data.inventory && data.dailyRecords && data.expenses);

        if (!isRH && !isFull) {
          showToast('Format de fichier de sauvegarde invalide.', 'error');
          return;
        }

        const confirmMsg = isRH
          ? 'Êtes-vous sûr de vouloir restaurer les données RH (Employés, Présences, Salaires) ? Les données RH actuelles seront remplacées.'
          : 'Êtes-vous sûr de vouloir restaurer cette base de données ? Les données POS actuelles seront remplacées.';

        if (confirm(confirmMsg)) {
          const res = await restoreFromJSON(file);
          if (res.type === 'rh') {
            showToast('Restauration des données RH réussie !', 'success');
          } else {
            showToast('Restauration de la base réussie ! Le salaire local a été préservé.', 'success');
          }
          // Reload location to reset queries safely
          setTimeout(() => window.location.reload(), 1500);
        }
      } catch (err: any) {
        showToast(err.message || 'Échec de la restauration.', 'error');
      }
    };
    reader.onerror = () => {
      showToast('Erreur de lecture du fichier.', 'error');
    };
    reader.readAsText(file);
  };


  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const added = await importEmployeesFromCSV(file);
      showToast(`${added} nouvel/nouveaux employé(s) importé(s) avec succès !`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Échec de l\'import CSV.', 'error');
    }
  };

  // --- SECURITY ACTIONS ---

  const handleSecuritySave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPin) {
      if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
        showToast('Le code PIN de verrouillage doit contenir 4 chiffres.', 'warning');
        return;
      }
      if (newPin !== confirmPin) {
        showToast('Les codes PIN ne correspondent pas.', 'error');
        return;
      }
      await saveSecurityPin(newPin);
      setNewPin('');
      setConfirmPin('');
      setShowPinInputs(false);
      showToast('Nouveau code PIN de déverrouillage enregistré.', 'success');
    }

    saveSecuritySettings({
      pinEnabled,
      inactivityDelay: Number(inactivityDelay)
    });
    showToast('Paramètres de sécurité mis à jour.', 'success');
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-fade-scale">
      
      {/* 1. BRANDING & GRAPHICAL SETTINGS */}
      <div className="flex flex-col gap-6 xl:col-span-2">
        
        {/* Brand Theme / Style Box */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-6 rounded-2xl shadow-sm flex flex-col gap-5">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Palette className="w-5.5 h-5.5 text-brand" />
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white">Identité Visuelle & Couleurs</h3>
              <p className="text-xs text-slate-400">Modifier le logo et le thème couleur de marque</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Logo upload */}
            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-950/20 text-center">
              {logoBase64 ? (
                <div className="relative group">
                  <img src={logoBase64} alt="Brand Logo" className="h-28 w-28 object-contain rounded-xl border p-1 bg-white" />
                  <button 
                    onClick={removeLogo}
                    className="absolute -top-2 -right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-md transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full mb-3 text-slate-400">
                    <Upload className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-semibold text-slate-500 mb-1">Aucun logo configuré</span>
                  <p className="text-4xs text-slate-400 mb-4">PNG, JPG ou SVG. Max 800Ko</p>
                  
                  <label className="btn-secondary py-1.5 px-3 text-xs cursor-pointer">
                    Charger un Logo
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  </label>
                </div>
              )}
            </div>

            {/* Colors picker */}
            <div className="flex flex-col gap-4">
              <span className="form-label">Couleur du Thème Principal</span>
              <div className="grid grid-cols-5 gap-3">
                {[
                  '#14522D', // Green brand
                  '#0f766e', // Teal
                  '#1d4ed8', // Royal Blue
                  '#7c3aed', // Purple
                  '#db2777', // Pink
                  '#ea580c', // Orange
                  '#1e293b', // Slate Dark
                  '#b91c1c', // Crimson Red
                  '#4d7c0f', // Lime green
                  '#0369a1'  // Sky
                ].map(color => (
                  <button
                    key={color}
                    onClick={() => saveBrandingColor(color)}
                    style={{ backgroundColor: color }}
                    className={`w-10 h-10 rounded-xl relative hover:scale-110 active:scale-95 shadow-sm transition-all ${
                      brandColor === color ? 'ring-4 ring-offset-2 ring-brand/50' : ''
                    }`}
                  />
                ))}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                La couleur sélectionnée est enregistrée en base et s'applique dynamiquement à l'ensemble des boutons et indicateurs de l'application.
              </div>

              {/* Glassmorphism settings */}
              <div className="border-t border-slate-100 dark:border-slate-800/80 pt-4 mt-2 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Thème Glassmorphic ("Liquid Glass")</span>
                  <button
                    type="button"
                    onClick={() => saveGlassmorphismSettings(!glassEnabled, glassOpacity)}
                    className={`w-12 h-6 rounded-full p-1 transition-all ${
                      glassEnabled ? 'bg-brand' : 'bg-slate-300 dark:bg-slate-800'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      glassEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {glassEnabled && (
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Opacité du verre</span>
                      <span className="font-bold font-mono">{(glassOpacity * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="0.40"
                      step="0.01"
                      value={glassOpacity}
                      onChange={e => saveGlassmorphismSettingsSilent(glassEnabled, Number(e.target.value))}
                      className="w-full accent-brand bg-slate-100 dark:bg-slate-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Company Info Box */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-6 rounded-2xl shadow-sm flex flex-col gap-5">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Building2 className="w-5.5 h-5.5 text-brand" />
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white">Informations d'Entreprise</h3>
              <p className="text-xs text-slate-400">En-tête et mentions légales des factures et fiches PDF</p>
            </div>
          </div>

          <form onSubmit={saveCompanyDetails} className="flex flex-col gap-4">
            <div>
              <label className="form-label">Raison Sociale / Nom</label>
              <input
                type="text"
                required
                value={compName}
                onChange={e => setCompName(e.target.value)}
                className="form-input"
              />
            </div>

            <div>
              <label className="form-label">Coordonnées / Adresse & Téléphone</label>
              <textarea
                rows={3}
                required
                value={compContact}
                onChange={e => setCompContact(e.target.value)}
                className="form-input font-mono text-xs"
              />
            </div>

            <div>
              <label className="form-label">Pied de Page Légaux (Copyright/Mentions)</label>
              <input
                type="text"
                required
                value={compFooter}
                onChange={e => setCompFooter(e.target.value)}
                className="form-input"
              />
            </div>

            <button type="submit" className="btn-primary self-end">
              <Save className="w-4 h-4" />
              Sauvegarder Details
            </button>
          </form>
        </div>

      </div>

      {/* 2. SECURITY LOCK & ODOO BRIDGE LOGS */}
      <div className="flex flex-col gap-6">
        
        {/* Security Lock configurations */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-6 rounded-2xl shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Shield className="w-5.5 h-5.5 text-brand" />
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white">Sécurité & Verrou Inactivité</h3>
              <p className="text-xs text-slate-400">Verrouillage automatique par code PIN</p>
            </div>
          </div>

          <form onSubmit={handleSecuritySave} className="flex flex-col gap-4">
            
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Activer le verrou PIN</span>
              <button
                type="button"
                onClick={() => setPinEnabled(!pinEnabled)}
                className={`w-12 h-6 rounded-full p-1 transition-all ${
                  pinEnabled ? 'bg-brand' : 'bg-slate-300'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  pinEnabled ? 'translate-x-6' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {pinEnabled && (
              <div className="flex flex-col gap-4 animate-fade-scale">
                <div>
                  <label className="form-label">Délai d'inactivité (minutes)</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={inactivityDelay}
                    onChange={e => setInactivityDelay(Number(e.target.value))}
                    className="form-input"
                  />
                  <p className="text-4xs text-slate-400 mt-1">L'application se verrouillera si aucune activité n'est détectée pendant ce délai.</p>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowPinInputs(!showPinInputs)}
                    className="text-xs font-bold text-brand hover:underline flex items-center gap-1"
                  >
                    <Key className="w-3.5 h-3.5" />
                    {securitySettings.pinHash ? 'Modifier le code PIN' : 'Créer un code PIN'}
                  </button>
                </div>

                {showPinInputs && (
                  <div className="flex flex-col gap-3 animate-fade-scale">
                    <div>
                      <label className="form-label">Nouveau PIN à 4 chiffres</label>
                      <input
                        type="password"
                        maxLength={4}
                        placeholder="••••"
                        value={newPin}
                        onChange={e => setNewPin(e.target.value)}
                        className="form-input text-center tracking-widest font-bold"
                      />
                    </div>
                    <div>
                      <label className="form-label">Confirmer PIN</label>
                      <input
                        type="password"
                        maxLength={4}
                        placeholder="••••"
                        value={confirmPin}
                        onChange={e => setConfirmPin(e.target.value)}
                        className="form-input text-center tracking-widest font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <button type="submit" className="btn-primary self-stretch mt-2">
              <Save className="w-4.5 h-4.5" />
              Mettre à jour la Sécurité
            </button>

          </form>
        </div>

        {/* Odoo Sync Log activity */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-6 rounded-2xl shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <Lock className="w-5.5 h-5.5 text-brand" />
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white">Odoo Bridge Status</h3>
                <p className="text-xs text-slate-400">Activités et logs de synchro</p>
              </div>
            </div>
            <button 
              onClick={fetchOdooLogs}
              disabled={loadingLog}
              className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-500"
            >
              <RefreshCw className={`w-4 h-4 ${loadingLog ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            {odooLog ? (
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/80 font-mono text-2xs flex flex-col gap-1 text-slate-600 dark:text-slate-400">
                <div className="flex justify-between font-bold border-b pb-1.5 mb-1.5 border-slate-200/40 dark:border-slate-800/40">
                  <span>Log type:</span>
                  <span className={odooLog.status === 'success' ? 'text-emerald-500' : 'text-red-500'}>
                    {odooLog.status.toUpperCase()}
                  </span>
                </div>
                <div><span className="font-bold">Sync:</span> {odooLog.kind}</div>
                <div><span className="font-bold">Message:</span> {odooLog.message}</div>
                <div><span className="font-bold">Date:</span> {new Date(odooLog.timestamp).toLocaleString('fr-FR')}</div>
              </div>
            ) : (
              <p className="text-xs italic text-slate-400 text-center py-4">Aucun log de synchro Odoo trouvé.</p>
            )}
          </div>
        </div>

        {/* Administration & Backups Panel */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-6 rounded-2xl shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Database className="w-5.5 h-5.5 text-brand" />
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white">Administration & Sauvegardes</h3>
              <p className="text-xs text-slate-400">Gérer les imports et exports de la base de données</p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {/* Export database */}
            <button
              onClick={handleExportJSON}
              className="btn-secondary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 border dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
            >
              <Download className="w-4 h-4 text-brand" />
              Exporter la base de données (JSON)
            </button>

            {/* Restore database */}
            <div className="flex flex-col gap-1.5">
              <label className="text-3xs font-bold uppercase tracking-wider text-slate-400">Restaurer la base de données (JSON)</label>
              <label className="btn-secondary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 border border-dashed dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer">
                <Database className="w-4 h-4 text-brand" />
                Charger un fichier de sauvegarde (.json)
                <input
                  type="file"
                  accept=".json"
                  onChange={handleJSONRestore}
                  className="hidden"
                />
              </label>
            </div>

            {/* CSV Import */}
            <div className="flex flex-col gap-1.5">
              <label className="text-3xs font-bold uppercase tracking-wider text-slate-400">Importer des employés (CSV)</label>
              <label className="btn-secondary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 border border-dashed dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer">
                <Upload className="w-4 h-4 text-brand" />
                Charger un fichier d'effectifs (.csv)
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVImport}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
