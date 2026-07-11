import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, RhEmployee, RhAppDataPayload } from '../db/database';
import { useAuth } from '../context/AuthContext';
import { 
  Coins, Filter, Search, 
  MapPin, Calendar, Edit2, Save, User, DollarSign 
} from 'lucide-react';
import { SITES, MONTHS } from '../config/constants';
import { showToast } from '../components/ui/Toast';
import { useExports } from '../hooks/useExports';
import { ExportButton } from '../components/ExportButton';
import { Modal } from '../components/ui/Modal';


// --- SALAIRES PAGE COMPONENT ---

export const Salaires: React.FC = () => {
  const { hasAccess } = useAuth();
  const rhData = useLiveQuery(() => db.rhAppData.get('rh_app_data'));
  
  const employees = rhData?.value?.employees || [];
  const attendance = rhData?.value?.attendance || {};
  const payrollExtras = rhData?.value?.payrollExtras || {};
  const visibleSundays = rhData?.value?.visibleSundays || [];

  // Filter States
  const [selectedSite, setSelectedSite] = useState(SITES[0] || '');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);

  const [selectedEmp, setSelectedEmp] = useState<RhEmployee | null>(null);

  
  // Modal Fields
  const [formPrime, setFormPrime] = useState<number>(0);
  const [formDette, setFormDette] = useState<number>(0);
  const [formRetenue, setFormRetenue] = useState<number>(0);

  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  const activeEmployees = useMemo(() => {
    return employees.filter(emp => emp.site === selectedSite && emp.statut !== 'renvoye');
  }, [employees, selectedSite]);

  const keyMonth = `${selectedYear}-${selectedMonth}`;

  // --- LOGIQUE CALCULS DE PAIE ---

  const payrollData = useMemo(() => {
    const joursOuvrables = 22;
    return activeEmployees.map(emp => {
      const extrasKey = `${emp.id}_${keyMonth}`;
      const extras = payrollExtras[extrasKey] || { prime: 0, dette: 0, retenue: 0 };
      
      let absentCount = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(selectedYear, selectedMonth, d);
        const isSunday = dateObj.getDay() === 0;

        // Skip dismissal date check
        if (emp.statut === 'renvoye' && emp.dateRenvoi) {
          const dismissalDate = new Date(emp.dateRenvoi);
          dismissalDate.setHours(0, 0, 0, 0);
          dateObj.setHours(0, 0, 0, 0);
          if (dateObj > dismissalDate) continue;
        }

        // Skip start date check
        if (emp.dateEmbauche) {
          const startDate = new Date(emp.dateEmbauche);
          startDate.setHours(0, 0, 0, 0);
          dateObj.setHours(0, 0, 0, 0);
          if (dateObj < startDate) continue;
        }

        // Get status
        const key = `${emp.id}_${selectedYear}-${selectedMonth}-${d}`;
        const status = attendance[key];
        
        // Absent (2) excluding Sundays
        if (status === 2 && !isSunday) {
          absentCount++;
        }
      }

      const baseSalary = emp.salaireBase;
      const retenueAbsence = Math.round((baseSalary / joursOuvrables) * absentCount);
      const net = Math.max(0, Math.round(baseSalary + (extras.prime || 0) - (extras.dette || 0) - (extras.retenue || 0) - retenueAbsence));

      return {
        emp,
        baseSalary,
        absentDays: absentCount,
        retenueAbsence,
        extras,
        net
      };
    });
  }, [activeEmployees, selectedYear, selectedMonth, attendance, payrollExtras, daysInMonth, keyMonth]);

  // Totals calculations
  const totals = useMemo(() => {
    return payrollData.reduce((acc, curr) => ({
      base: acc.base + curr.baseSalary,
      retenues: acc.retenues + curr.extras.retenue + curr.retenueAbsence,
      primes: acc.primes + curr.extras.prime,
      dettes: acc.dettes + curr.extras.dette,
      net: acc.net + curr.net
    }), { base: 0, retenues: 0, primes: 0, dettes: 0, net: 0 });
  }, [payrollData]);

  const filteredPayroll = useMemo(() => {
    return payrollData.filter(p => 
      `${p.emp.nom} ${p.emp.prenom}`.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [payrollData, searchTerm]);

  // --- ACTIONS ---

  const openExtrasModal = (emp: RhEmployee) => {
    if (!hasAccess('salaires', 'edit')) {
      showToast('Opération non autorisée en lecture seule.', 'error');
      return;
    }
    const extrasKey = `${emp.id}_${keyMonth}`;
    const extras = payrollExtras[extrasKey] || { prime: 0, dette: 0, retenue: 0 };
    setSelectedEmp(emp);
    setFormPrime(extras.prime);
    setFormDette(extras.dette);
    setFormRetenue(extras.retenue);
    setShowModal(true);
  };

  const saveExtras = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) return;

    const extrasKey = `${selectedEmp.id}_${keyMonth}`;
    const updatedExtras = {
      ...payrollExtras,
      [extrasKey]: {
        prime: Number(formPrime),
        dette: Number(formDette),
        retenue: Number(formRetenue)
      }
    };

    const value: RhAppDataPayload = {
      employees,
      attendance,
      payrollExtras: updatedExtras,
      visibleSundays
    };

    await db.rhAppData.put({ key: 'rh_app_data', value });
    setShowModal(false);
    showToast(`Primes & Acomptes mis à jour pour ${selectedEmp.nom}.`, 'success');
  };

  const { exportPayrollPDF } = useExports();

  return (
    <div className="flex flex-col gap-6 animate-fade-scale">
      
      {/* Filters Header bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-brand" />
            <select
              value={selectedSite}
              onChange={e => setSelectedSite(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none shadow-sm"
            >
              {SITES.map(site => <option key={site} value={site}>{site}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand" />
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none shadow-sm"
            >
              {MONTHS.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
            </select>

            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none shadow-sm"
            >
              {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="relative max-w-xs w-48">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="form-input pl-9 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border-slate-200 shadow-sm"
            />
          </div>
        </div>

        <ExportButton
          onPDF={() => exportPayrollPDF(filteredPayroll)}
          className="btn-secondary py-1 px-2.5 text-sm"
        />
      </div>

      {/* Totals panel cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl">
          <span className="text-4xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Masse Salariale Base</span>
          <span className="text-lg font-bold text-slate-700 dark:text-slate-200 font-mono">{totals.base.toLocaleString()} F</span>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl">
          <span className="text-4xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Total Primes Versées</span>
          <span className="text-lg font-bold text-emerald-600 font-mono">+{totals.primes.toLocaleString()} F</span>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl">
          <span className="text-4xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Total Retenues & Avances</span>
          <span className="text-lg font-bold text-red-500 font-mono">-{totals.dettes.toLocaleString()} F</span>
        </div>
        <div className="p-4 bg-brand/5 dark:bg-brand/10 border border-brand/20 rounded-2xl">
          <span className="text-4xs font-bold text-brand uppercase tracking-widest block mb-1">Masse Nette Finale</span>
          <span className="text-lg font-extrabold text-brand font-mono">{totals.net.toLocaleString()} F</span>
        </div>
      </div>

      {/* Main List display (Responsive) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
        
        {/* DESKTOP VIEW */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[750px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                <th className="table-header">Nom Complet</th>
                <th className="table-header text-right">Salaire Base</th>
                <th className="table-header text-center">Abs (Déd.)</th>
                <th className="table-header text-right">Primes</th>
                <th className="table-header text-right">Avances / Ret</th>
                <th className="table-header text-right">Net à payer</th>
                <th className="table-header text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayroll.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm italic text-slate-400">
                    Aucun employé trouvé.
                  </td>
                </tr>
              ) : (
                filteredPayroll.map(p => (
                  <tr key={p.emp.id} className="table-row">
                    <td className="table-cell font-semibold text-slate-800 dark:text-slate-100">
                      {p.emp.nom} {p.emp.prenom}
                      <span className="text-4xs font-normal text-slate-400 block tracking-normal italic mt-0.5">
                        {p.emp.type === 'permanent' ? 'Permanent' : 'Temporaire'}
                      </span>
                    </td>
                    <td className="table-cell text-right font-mono">{p.baseSalary.toLocaleString()} F</td>
                    <td className="table-cell text-center">
                      <span className={`font-mono text-xs ${p.absentDays > 0 ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                        {p.absentDays}j (-{p.retenueAbsence.toLocaleString()} F)
                      </span>
                    </td>
                    <td className="table-cell text-right font-mono text-emerald-600 font-medium">
                      +{p.extras.prime.toLocaleString()} F
                    </td>
                    <td className="table-cell text-right font-mono text-red-500">
                      -{(p.extras.dette + p.extras.retenue).toLocaleString()} F
                    </td>
                    <td className="table-cell text-right font-mono font-extrabold text-brand">
                      {p.net.toLocaleString()} F
                    </td>
                    <td className="table-cell text-center">
                      <div className="flex items-center justify-center gap-2">
                        {hasAccess('salaires', 'edit') && (
                          <button
                            onClick={() => openExtrasModal(p.emp)}
                            className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded-lg font-medium text-xs flex items-center gap-1 transition-all"
                            title="Modifier Acomptes / Primes"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Ajuster
                          </button>
                        )}
                        <button
                          onClick={() => exportPayrollPDF([p])}
                          className="p-1.5 bg-brand/5 hover:bg-brand/10 text-brand rounded-lg font-medium text-xs flex items-center gap-1 transition-all"
                        >
                          Bulletin
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE VIEW */}
        <div className="md:hidden grid grid-cols-1 gap-4 p-4">
          {filteredPayroll.length === 0 ? (
            <p className="text-center text-sm italic text-slate-400 py-6">Aucun salaire enregistré.</p>
          ) : (
            filteredPayroll.map(p => (
              <div 
                key={p.emp.id}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl p-4 flex flex-col gap-3 relative"
              >
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-white">{p.emp.nom} {p.emp.prenom}</h4>
                  <p className="text-4xs text-slate-400 capitalize mt-0.5">
                    {p.emp.type === 'permanent' ? 'Permanent' : 'Temporaire'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-mono">
                  <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1">
                    <span className="text-slate-400 text-3xs font-semibold uppercase">Base:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{p.baseSalary.toLocaleString()} F</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1">
                    <span className="text-slate-400 text-3xs font-semibold uppercase">Abs ({p.absentDays}j):</span>
                    <span className="font-bold text-red-500">-{p.retenueAbsence.toLocaleString()} F</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1">
                    <span className="text-slate-400 text-3xs font-semibold uppercase">Primes:</span>
                    <span className="font-bold text-emerald-600">+{p.extras.prime.toLocaleString()} F</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1">
                    <span className="text-slate-400 text-3xs font-semibold uppercase">Avances:</span>
                    <span className="font-bold text-red-400">-{(p.extras.dette + p.extras.retenue).toLocaleString()} F</span>
                  </div>
                </div>

                <div className="flex justify-between items-center bg-slate-100 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/40 dark:border-slate-800/40 mt-1">
                  <span className="text-2xs font-extrabold uppercase text-slate-500">Net à Payer:</span>
                  <span className="text-base font-extrabold text-brand font-mono">{p.net.toLocaleString()} F</span>
                </div>

                {/* Mobile actions */}
                <div className="flex gap-2 justify-end mt-2 pt-2 border-t border-slate-200/40 dark:border-slate-800/40">
                  {hasAccess('salaires', 'edit') && (
                    <button
                      onClick={() => openExtrasModal(p.emp)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-2xs rounded-lg flex items-center gap-1.5 transition-colors"
                    >
                      Ajuster
                    </button>
                  )}
                  <button
                    onClick={() => exportPayrollPDF([p])}
                    className="px-3 py-1.5 bg-brand/5 hover:bg-brand/10 text-brand font-bold text-2xs rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    Bulletin PDF
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

      </div>

      {/* EXTRAS AJUSTEMENT MODAL */}
      <Modal
        isOpen={showModal && !!selectedEmp}
        onClose={() => setShowModal(false)}
        title="Ajustements Paie"
        icon={<Coins className="w-5 h-5" />}
        size="md"
      >
        {selectedEmp && (
          <form onSubmit={saveExtras} className="p-6 flex flex-col gap-4">

            <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl flex items-center gap-3">
              <User className="w-5 h-5 text-brand flex-shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-white">
                  {selectedEmp.nom} {selectedEmp.prenom}
                </h4>
                <p className="text-4xs text-slate-400 capitalize mt-0.5">
                  Salaire base: {selectedEmp.salaireBase.toLocaleString()} F
                </p>
              </div>
            </div>

            <div>
              <label className="form-label">Primes de Performance / Diverses (FCFA)</label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                </div>
                <input
                  type="number"
                  value={formPrime}
                  onChange={e => setFormPrime(Number(e.target.value))}
                  className="form-input pl-9 font-mono text-sm font-semibold"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label className="form-label">Acomptes Perçus (Dettes) (FCFA)</label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <DollarSign className="w-4 h-4 text-red-500" />
                </div>
                <input
                  type="number"
                  value={formDette}
                  onChange={e => setFormDette(Number(e.target.value))}
                  className="form-input pl-9 font-mono text-sm font-semibold"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label className="form-label">Retenues Exceptionnelles (FCFA)</label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <DollarSign className="w-4 h-4 text-red-400" />
                </div>
                <input
                  type="number"
                  value={formRetenue}
                  onChange={e => setFormRetenue(Number(e.target.value))}
                  className="form-input pl-9 font-mono text-sm font-semibold"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="btn-secondary"
              >
                Annuler
              </button>
              <button type="submit" className="btn-primary">
                <Save className="w-4.5 h-4.5" />
                Appliquer
              </button>
            </div>

          </form>
        )}
      </Modal>

    </div>
  );
};
