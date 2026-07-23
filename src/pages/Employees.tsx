import React, { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, RhEmployee, RhAppDataPayload } from '../db/database';
import { useAuth } from '../context/AuthContext';
import { 
  Plus, Edit2, Trash2, Search, Filter, 
  Upload, Save, X, Phone, MapPin, 
  User, CreditCard, CalendarDays
} from 'lucide-react';
import { SITES } from '../config/constants';
import { showToast } from '../components/ui/Toast';
import { read, utils } from 'xlsx';
import { useExports } from '../hooks/useExports';
import { ExportButton } from '../components/ExportButton';
import { ExportPersonnelModal } from '../components/ExportPersonnelModal';
import { Modal } from '../components/ui/Modal';


// --- EMPLOYEES COMPONENT ---

export const Employees: React.FC = () => {
  const { hasAccess } = useAuth();
  const rhData = useLiveQuery(() => db.rhAppData.get('rh_app_data'));
  
  const employees = rhData?.value?.employees || [];
  const attendance = rhData?.value?.attendance || {};
  const payrollExtras = rhData?.value?.payrollExtras || {};
  const visibleSundays = rhData?.value?.visibleSundays || [];

  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSite, setFilterSite] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'permanent' | 'temporaire'>('all');
  
  const [showModal, setShowModal] = useState(false);

  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');

  const [selectedEmp, setSelectedEmp] = useState<RhEmployee | null>(null);

  // Form State
  const [formNom, setFormNom] = useState('');
  const [formPrenom, setFormPrenom] = useState('');
  const [formSite, setFormSite] = useState('');
  const [formType, setFormType] = useState<'permanent' | 'temporaire'>('permanent');
  const [formSalaireBase, setFormSalaireBase] = useState<number>(0);
  const [formContact, setFormContact] = useState('');
  const [formStatut, setFormStatut] = useState<'actif' | 'renvoye'>('actif');
  const [formDateRenvoi, setFormDateRenvoi] = useState('');
  const [formDateEmbauche, setFormDateEmbauche] = useState('');

  // Refs for Import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- ACTIONS ---

  const openAddModal = () => {
    if (!hasAccess('employes', 'add')) {
      showToast('Opération non autorisée en lecture seule.', 'error');
      return;
    }
    setModalMode('create');
    setSelectedEmp(null);
    setFormNom('');
    setFormPrenom('');
    setFormSite(SITES[0] || '');
    setFormType('permanent');
    setFormSalaireBase(0);
    setFormContact('');
    setFormStatut('actif');
    setFormDateRenvoi('');
    setFormDateEmbauche(new Date().toISOString().split('T')[0]);
    setShowModal(true);
  };

  const openEditModal = (emp: RhEmployee) => {
    if (!hasAccess('employes', 'edit')) {
      showToast('Opération non autorisée en lecture seule.', 'error');
      return;
    }
    setModalMode('edit');
    setSelectedEmp(emp);
    setFormNom(emp.nom);
    setFormPrenom(emp.prenom);
    setFormSite(emp.site);
    setFormType(emp.type);
    setFormSalaireBase(emp.salaireBase);
    setFormContact(emp.contact);
    setFormStatut(emp.statut);
    setFormDateRenvoi(emp.dateRenvoi || '');
    setFormDateEmbauche(emp.dateEmbauche || '');
    setShowModal(true);
  };

  const saveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNom || !formPrenom || !formSite) {
      showToast('Veuillez remplir tous les champs obligatoires.', 'warning');
      return;
    }

    const payload: RhEmployee = {
      id: modalMode === 'edit' && selectedEmp ? selectedEmp.id : Date.now(),
      nom: formNom.trim(),
      prenom: formPrenom.trim(),
      site: formSite,
      type: formType,
      salaireBase: Number(formSalaireBase),
      contact: formContact.trim(),
      statut: formStatut,
      dateRenvoi: formStatut === 'renvoye' ? (formDateRenvoi || new Date().toISOString().split('T')[0]) : null,
      dateEmbauche: formDateEmbauche || null
    };

    let updatedEmployees = [...employees];
    if (modalMode === 'edit') {
      updatedEmployees = updatedEmployees.map(emp => emp.id === payload.id ? payload : emp);
      showToast('Profil modifié avec succès.', 'success');
    } else {
      // Check duplicate
      const isDup = updatedEmployees.some(emp => 
        emp.nom.toUpperCase() === payload.nom.toUpperCase() && 
        emp.prenom.toUpperCase() === payload.prenom.toUpperCase()
      );
      if (isDup) {
        showToast('Cet employé existe déjà.', 'warning');
        return;
      }
      updatedEmployees.push(payload);
      showToast('Employé ajouté avec succès.', 'success');
    }

    const value: RhAppDataPayload = {
      employees: updatedEmployees,
      attendance,
      payrollExtras,
      visibleSundays
    };

    await db.rhAppData.put({ key: 'rh_app_data', value });
    setShowModal(false);
    
    // Broadcast status change for synchronization
    window.dispatchEvent(new CustomEvent('sync-status-change', { detail: { status: 'syncing' } }));
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('sync-status-change', { detail: { status: 'ok' } }));
    }, 1500);
  };

  const deleteEmployee = async (id: number) => {
    if (!hasAccess('employes', 'delete')) {
      showToast('Opération non autorisée en lecture seule.', 'error');
      return;
    }
    if (confirm('Voulez-vous vraiment supprimer cet employé ?')) {
      const updatedEmployees = employees.filter(emp => emp.id !== id);
      const value: RhAppDataPayload = {
        employees: updatedEmployees,
        attendance,
        payrollExtras,
        visibleSundays
      };
      await db.rhAppData.put({ key: 'rh_app_data', value });
      showToast('Employé supprimé.', 'success');
    }
  };

  // --- FILTERS & SEARCH ---

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = 
      `${emp.nom} ${emp.prenom}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.contact.includes(searchTerm) ||
      emp.site.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSite = filterSite ? emp.site === filterSite : true;
    const matchesType = filterType === 'all' ? true : emp.type === filterType;

    return matchesSearch && matchesSite && matchesType;
  });

  // --- EXCEL FILE IMPORT ---

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!hasAccess('employes', 'add')) {
      showToast('Opération non autorisée en lecture seule.', 'error');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Headers: Nom, Prénom, Site, Salaire Base, Contact, Type
        const rows = utils.sheet_to_json(sheet, { header: 1 }) as any[];
        if (rows.length <= 1) {
          showToast('Le fichier Excel est vide ou invalide.', 'warning');
          return;
        }

        const headers = rows[0].map((h: string) => String(h).trim().toUpperCase());
        const nomIdx = headers.indexOf('NOM');
        const prenomIdx = headers.indexOf('PRENOM');
        const siteIdx = headers.indexOf('SITE');
        const salaireIdx = headers.indexOf('SALAIRE BASE') !== -1 ? headers.indexOf('SALAIRE BASE') : headers.indexOf('SALAIRE');
        const contactIdx = headers.indexOf('CONTACT');
        const typeIdx = headers.indexOf('TYPE');

        if (nomIdx === -1 || prenomIdx === -1 || siteIdx === -1) {
          showToast('Colonnes requises manquantes dans le fichier (Nom, Prénom, Site).', 'error');
          return;
        }

        let addedCount = 0;
        let dupCount = 0;
        const currentEmployees = [...employees];
        const now = Date.now();

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const nom = String(row[nomIdx] || '').trim();
          const prenom = String(row[prenomIdx] || '').trim();
          const site = String(row[siteIdx] || '').trim();
          
          if (!nom || !prenom || !site) continue;

          const baseSalary = salaireIdx !== -1 ? Number(row[salaireIdx] || 0) : 0;
          const contact = contactIdx !== -1 ? String(row[contactIdx] || '').trim() : '';
          const rawType = typeIdx !== -1 ? String(row[typeIdx] || '').trim().toLowerCase() : 'permanent';
          const type: 'permanent' | 'temporaire' = rawType.includes('temp') || rawType.includes('jour') ? 'temporaire' : 'permanent';

          const isDuplicate = currentEmployees.some(emp => 
            emp.nom.toUpperCase() === nom.toUpperCase() && 
            emp.prenom.toUpperCase() === prenom.toUpperCase()
          );

          if (isDuplicate) {
            dupCount++;
            continue;
          }

          currentEmployees.push({
            id: now + i,
            nom,
            prenom,
            site,
            type,
            salaireBase: baseSalary,
            contact,
            statut: 'actif',
            dateRenvoi: null,
            dateEmbauche: new Date().toISOString().split('T')[0]
          });
          addedCount++;
        }

        if (addedCount > 0) {
          const value: RhAppDataPayload = {
            employees: currentEmployees,
            attendance,
            payrollExtras,
            visibleSundays
          };
          await db.rhAppData.put({ key: 'rh_app_data', value });
          showToast(`${addedCount} employés importés ! (${dupCount} doublons ignorés)`, 'success');
        } else {
          showToast('Aucun nouvel employé importé (doublons ou données manquantes).', 'warning');
        }
      } catch (err) {
        showToast('Erreur lors du traitement du fichier Excel.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; // Reset input
  };

  const [showExportModal, setShowExportModal] = useState(false);
  const { exportPersonnelPDF, exportPersonnelXLSX } = useExports();

  return (
    <div className="flex flex-col gap-6 animate-fade-scale">
      
      {/* Action Header panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        
        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-1 max-w-xs min-w-[200px]">
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher un employé..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="form-input pl-11 py-2 text-sm bg-white border-slate-200 shadow-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={filterSite}
              onChange={e => setFilterSite(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold shadow-sm focus:outline-none text-slate-700 dark:text-slate-200"
            >
              <option value="">Tous les sites</option>
              {SITES.map(site => <option key={site} value={site}>{site}</option>)}
            </select>

            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as any)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold shadow-sm focus:outline-none text-slate-700 dark:text-slate-200"
            >
              <option value="all">Tous les contrats</option>
              <option value="permanent">Permanent</option>
              <option value="temporaire">Temporaire</option>
            </select>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasAccess('employes', 'add') && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary py-2 px-3 text-sm flex items-center gap-1.5"
                title="Importer depuis Excel"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Importer</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls"
                onChange={handleImport}
                className="hidden"
              />
            </>
          )}

          <ExportButton 
            onPDF={() => setShowExportModal(true)} 
            onXLSX={() => exportPersonnelXLSX({ site: filterSite, type: filterType })} 
            className="btn-secondary py-1 px-2.5 text-sm"
          />

          {hasAccess('employes', 'add') && (
            <button onClick={openAddModal} className="btn-primary py-2 px-3 text-sm flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              Ajouter
            </button>
          )}
        </div>

      </div>

      {/* Main List display (Responsive: table on desktop, cards on mobile) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
        
        {/* DESKTOP TABLE */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                <th className="table-header text-center w-12">N°</th>
                <th className="table-header">Nom Complet</th>
                <th className="table-header text-center">Site</th>
                <th className="table-header text-center">Type Contrat</th>
                <th className="table-header text-right">Salaire Base / Taux</th>
                <th className="table-header text-center">Statut</th>
                <th className="table-header">Contact</th>
                <th className="table-header text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm italic text-slate-400">
                    Aucun employé trouvé.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp, index) => (
                  <tr key={emp.id} className="table-row">
                    <td className="table-cell text-center font-mono text-xs text-slate-400 font-extrabold">{index + 1}</td>
                    <td className="table-cell font-semibold text-slate-800 dark:text-slate-100">
                      {emp.nom} {emp.prenom}
                    </td>
                    <td className="table-cell text-center">
                      <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-full font-medium text-xs text-slate-700 dark:text-slate-300">
                        {emp.site}
                      </span>
                    </td>
                    <td className="table-cell text-center font-medium">
                      {emp.type === 'permanent' ? 'Permanent' : 'Temporaire'}
                    </td>
                    <td className="table-cell text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                      {emp.salaireBase.toLocaleString()} F
                    </td>
                    <td className="table-cell text-center">
                      <span className={`px-2.5 py-1 rounded-full text-3xs font-extrabold uppercase ${
                        emp.statut === 'actif' 
                          ? 'bg-emerald-500/10 text-emerald-600' 
                          : 'bg-red-500/10 text-red-600'
                      }`}>
                        {emp.statut === 'actif' ? 'Actif' : 'Fin contrat'}
                      </span>
                    </td>
                    <td className="table-cell font-mono text-xs">{emp.contact}</td>
                    <td className="table-cell text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditModal(emp)}
                          className="p-1 text-slate-400 hover:text-brand dark:hover:text-brand-light transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteEmployee(emp.id)}
                          className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARD GRID */}
        <div className="md:hidden grid grid-cols-1 gap-4 p-4">
          {filteredEmployees.length === 0 ? (
            <p className="text-center text-sm italic text-slate-400 py-6">Aucun employé trouvé.</p>
          ) : (
            filteredEmployees.map((emp, index) => (
              <div 
                key={emp.id}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl p-4 flex flex-col gap-3 relative"
              >
                {/* Status indicator top right */}
                <span className={`absolute top-4 right-4 px-2 py-0.5 rounded-full text-4xs font-extrabold uppercase ${
                  emp.statut === 'actif' 
                    ? 'bg-emerald-500/10 text-emerald-600' 
                    : 'bg-red-500/10 text-red-600'
                }`}>
                  {emp.statut === 'actif' ? 'Actif' : 'Fin Contrat'}
                </span>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-3xs font-extrabold rounded-md">#{index + 1}</span>
                  <User className="w-4 h-4 text-brand" />
                  <span className="font-bold text-slate-800 dark:text-white">{emp.nom} {emp.prenom}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{emp.site}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <CalendarDays className="w-3.5 h-3.5" />
                    <span className="capitalize">{emp.type === 'permanent' ? 'Permanent' : 'Temporaire'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <CreditCard className="w-3.5 h-3.5" />
                    <span className="font-mono font-semibold">{emp.salaireBase.toLocaleString()} F</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Phone className="w-3.5 h-3.5" />
                    <span className="font-mono">{emp.contact || 'N/A'}</span>
                  </div>
                </div>

                {/* Edit/Delete Actions */}
                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-1 flex justify-end gap-3">
                  <button
                    onClick={() => openEditModal(emp)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-brand"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Modifier
                  </button>
                  <button
                    onClick={() => deleteEmployee(emp.id)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Supprimer
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

      </div>

      {/* MODAL ADD/EDIT EMPLOYEE */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={modalMode === 'create' ? 'Ajouter un employé' : 'Modifier le profil'}
        size="lg"
      >
            <form onSubmit={saveEmployee} className="p-6 flex flex-col gap-4">

              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Nom <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={formNom}
                    onChange={e => setFormNom(e.target.value)}
                    className="form-input"
                    placeholder="ex. NJOYA"
                  />
                </div>
                <div>
                  <label className="form-label">Prénom <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={formPrenom}
                    onChange={e => setFormPrenom(e.target.value)}
                    className="form-input"
                    placeholder="ex. Ibrahim"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Site <span className="text-red-500">*</span></label>
                  <select
                    value={formSite}
                    onChange={e => setFormSite(e.target.value)}
                    className="form-input"
                  >
                    {SITES.map(site => <option key={site} value={site}>{site}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Contrat / Type</label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value as any)}
                    className="form-input"
                  >
                    <option value="permanent">Permanent (CDD/CDI)</option>
                    <option value="temporaire">Temporaire / Journalier</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">
                    {formType === 'permanent' ? 'Salaire de Base (FCFA)' : 'Taux Journalier (FCFA)'}
                  </label>
                  <input
                    type="number"
                    value={formSalaireBase}
                    onChange={e => setFormSalaireBase(Number(e.target.value))}
                    className="form-input font-mono font-semibold"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="form-label">Contact (Téléphone)</label>
                  <input
                    type="tel"
                    value={formContact}
                    onChange={e => setFormContact(e.target.value)}
                    className="form-input font-mono"
                    placeholder="ex. 699000000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Date Embauche</label>
                  <input
                    type="date"
                    value={formDateEmbauche}
                    onChange={e => setFormDateEmbauche(e.target.value)}
                    className="form-input"
                  />
                </div>
                {modalMode === 'edit' && (
                  <div>
                    <label className="form-label">Statut Contrat</label>
                    <select
                      value={formStatut}
                      onChange={e => setFormStatut(e.target.value as any)}
                      className="form-input"
                    >
                      <option value="actif">Actif</option>
                      <option value="renvoye">Renvoyé / Fin Contrat</option>
                    </select>
                  </div>
                )}
              </div>

              {formStatut === 'renvoye' && (
                <div>
                  <label className="form-label text-red-500">Date Fin Contrat</label>
                  <input
                    type="date"
                    required
                    value={formDateRenvoi}
                    onChange={e => setFormDateRenvoi(e.target.value)}
                    className="form-input border-red-200 focus:ring-red-400/40 focus:border-red-500"
                  />
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex gap-3 justify-end border-t border-slate-100 dark:border-slate-800/80 pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary"
                >
                  Annuler
                </button>
                <button type="submit" className="btn-primary">
                  <Save className="w-4.5 h-4.5" />
                  Sauvegarder
                </button>
              </div>

            </form>
      </Modal>
      {showExportModal && (
        <ExportPersonnelModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          onExport={(selectedCols, customCols) =>
            exportPersonnelPDF({
              exportColumns: selectedCols,
              customColumns: customCols,
              filters: { site: filterSite, type: filterType },
            })
          }
        />
      )}

    </div>
  );
};
