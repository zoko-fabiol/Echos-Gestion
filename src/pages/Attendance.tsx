import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, RhEmployee, RhAppDataPayload } from '../db/database';
import { useAuth } from '../context/AuthContext';
import { 
  CalendarDays, Check, X, AlertTriangle, ChevronLeft, 
  ChevronRight, MapPin, Calendar, UserPlus, Plus, FileText, FileSpreadsheet
} from 'lucide-react';
import { SITES, MONTHS } from '../config/constants';
import { showToast } from '../components/ui/Toast';
import { useExports } from '../hooks/useExports';
import { ExportButton } from '../components/ExportButton';
import { logAction } from '../services/logService';

export const Attendance: React.FC = () => {
  const { hasAccess } = useAuth();
  const rhData = useLiveQuery(() => db.rhAppData.get('rh_app_data'));
  
  const employees = rhData?.value?.employees || [];
  const attendance = rhData?.value?.attendance || {};
  const payrollExtras = rhData?.value?.payrollExtras || {};
  const visibleSundays = rhData?.value?.visibleSundays || [];

  // Filters State
  const [selectedSite, setSelectedSite] = useState(SITES[0] || '');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showSundays, setShowSundays] = useState(false);
  
  // Mobile Day Selector State
  const [selectedDayMobile, setSelectedDayMobile] = useState(new Date().getDate());
  const [mobileDisplayMode, setMobileDisplayMode] = useState<'daily' | 'grid'>('daily');

  // --- DERIVED VALUES ---

  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  const activeEmployees = useMemo(() => {
    return employees.filter(emp => emp.site === selectedSite && emp.statut !== 'renvoye');
  }, [employees, selectedSite]);

  // Adjust Mobile Selected Day if out of bounds
  useEffect(() => {
    if (selectedDayMobile > daysInMonth) {
      setSelectedDayMobile(daysInMonth);
    }
  }, [daysInMonth, selectedDayMobile]);

  // --- HELPERS ---

  const isBeforeStart = (emp: RhEmployee, day: number) => {
    if (!emp.dateEmbauche) return false;
    const targetDate = new Date(selectedYear, selectedMonth, day);
    const startDate = new Date(emp.dateEmbauche);
    startDate.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);
    return targetDate.getTime() < startDate.getTime();
  };

  const isDismissed = (emp: RhEmployee, day: number) => {
    if (emp.statut !== 'renvoye' || !emp.dateRenvoi) return false;
    const targetDate = new Date(selectedYear, selectedMonth, day);
    const dismissalDate = new Date(emp.dateRenvoi);
    dismissalDate.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);
    return targetDate.getTime() > dismissalDate.getTime();
  };

  const isToday = (day: number) => {
    const now = new Date();
    return (
      day === now.getDate() &&
      selectedMonth === now.getMonth() &&
      selectedYear === now.getFullYear()
    );
  };

  const resolveStatus = (emp: RhEmployee, day: number) => {
    const key = `${emp.id}_${selectedYear}-${selectedMonth}-${day}`;
    const status = attendance[key];
    if (status !== undefined) return status;

    // Defaults: Raw/Temporaires default Absent/Justified (3), CDI/Permanent default Present (1)
    return emp.type === 'temporaire' ? 3 : 1;
  };

  // --- TOGGLE ACTIONS ---

  const toggleStatus = async (empId: number, day: number) => {
    if (!hasAccess('pointage', 'edit')) {
      showToast('Accès en lecture seule : modification du pointage non autorisée.', 'error');
      return;
    }

    const emp = employees.find(e => e.id === empId);
    if (!emp || isBeforeStart(emp, day) || isDismissed(emp, day)) return;

    const currentStatus = resolveStatus(emp, day);
    // Cycle: 1 (Present) -> 2 (Absent) -> 3 (Justified) -> 1
    const nextStatus = (currentStatus % 3) + 1;

    const key = `${empId}_${selectedYear}-${selectedMonth}-${day}`;
    const updatedAttendance = { ...attendance, [key]: nextStatus };

    const value: RhAppDataPayload = {
      employees,
      attendance: updatedAttendance,
      payrollExtras,
      visibleSundays
    };

    await db.rhAppData.put({ key: 'rh_app_data', value });
    await logAction('update', 'pointage', `Pointage de ${emp.nom} ${emp.prenom} modifié pour le ${day}/${selectedMonth + 1}/${selectedYear} : ${getStatusText(nextStatus)}`, emp.id);
  };

  const toggleSundayVisibility = async (day: number) => {
    if (!hasAccess('pointage', 'edit')) {
      showToast('Accès en lecture seule : modification non autorisée.', 'error');
      return;
    }
    const sundayKey = `${selectedYear}-${selectedMonth}-${day}`;
    let updatedVisibleSundays = [...visibleSundays];
    const updatedAttendance = { ...attendance };

    if (visibleSundays.includes(sundayKey)) {
      updatedVisibleSundays = updatedVisibleSundays.filter(k => k !== sundayKey);
    } else {
      updatedVisibleSundays.push(sundayKey);
      // Auto-initialize all employees to 3 (Justified) on this newly visible Sunday if undefined
      employees.forEach(emp => {
        const key = `${emp.id}_${selectedYear}-${selectedMonth}-${day}`;
        if (updatedAttendance[key] === undefined) {
          updatedAttendance[key] = 3;
        }
      });
    }

    const value: RhAppDataPayload = {
      employees,
      attendance: updatedAttendance,
      payrollExtras,
      visibleSundays: updatedVisibleSundays
    };
    await db.rhAppData.put({ key: 'rh_app_data', value });
    await logAction('update', 'pointage', `Visibilité du dimanche ${day}/${selectedMonth + 1}/${selectedYear} modifiée`);
  };

  // --- RENDERING HELPERS ---

  const getCellBgColor = (status: number, isInactive: boolean, isSunday: boolean) => {
    if (isInactive) return 'bg-slate-100 dark:bg-slate-900/60 text-slate-400 cursor-not-allowed';
    if (isSunday) return status === 2 ? 'bg-red-50 dark:bg-red-950/20 text-red-600' : 'bg-yellow-50/40 dark:bg-yellow-950/10 text-slate-800 dark:text-slate-200';
    
    switch (status) {
      case 1: return 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400';
      case 2: return 'bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400';
      case 3: return 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400';
      default: return 'bg-slate-50 dark:bg-slate-900';
    }
  };

  const getCellIcon = (status: number) => {
    switch (status) {
      case 1: return <Check className="w-4 h-4 mx-auto" />;
      case 2: return <X className="w-4 h-4 mx-auto" />;
      case 3: return <AlertTriangle className="w-4 h-4 mx-auto" />;
      default: return null;
    }
  };

  const getStatusText = (status: number) => {
    switch (status) {
      case 1: return 'Présent';
      case 2: return 'Absent';
      case 3: return 'Justifié';
      default: return 'Présent';
    }
  };

  const { exportAttendancePDF, exportAttendanceXLSX, exportAttendanceTodayPDF } = useExports();

  return (
    <div className="flex flex-col gap-6 animate-fade-scale">
      
      {/* Search & Site selection bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-brand" />
            <select
              value={selectedSite}
              onChange={e => setSelectedSite(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold shadow-sm text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              {SITES.map(site => <option key={site} value={site}>{site}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand" />
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold shadow-sm text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              {MONTHS.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
            </select>

            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold shadow-sm text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2.5 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold shadow-sm text-slate-700 dark:text-slate-200 select-none">
            <span>Afficher les dimanches</span>
            <button
              type="button"
              onClick={() => setShowSundays(!showSundays)}
              className={`w-9 h-5.5 rounded-full p-0.5 transition-all duration-300 ${
                showSundays ? 'bg-brand' : 'bg-slate-300 dark:bg-slate-800'
              }`}
            >
              <div className={`w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                showSundays ? 'translate-x-3.5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {/* Mobile Display Mode Selector */}
          <div className="flex lg:hidden bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border dark:border-slate-850">
            <button
              type="button"
              onClick={() => setMobileDisplayMode('daily')}
              className={`py-1 px-3 text-3xs font-bold rounded-lg transition-all ${
                mobileDisplayMode === 'daily'
                  ? 'bg-white dark:bg-slate-800 text-brand shadow-sm'
                  : 'text-slate-500 hover:text-slate-750 dark:hover:text-slate-300'
              }`}
            >
              Jour par Jour
            </button>
            <button
              type="button"
              onClick={() => setMobileDisplayMode('grid')}
              className={`py-1 px-3 text-3xs font-bold rounded-lg transition-all ${
                mobileDisplayMode === 'grid'
                  ? 'bg-white dark:bg-slate-800 text-brand shadow-sm'
                  : 'text-slate-500 hover:text-slate-750 dark:hover:text-slate-300'
              }`}
            >
              Vue Complète
            </button>
          </div>
        </div>

        {activeEmployees.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportAttendanceTodayPDF}
              className="px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold shadow-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all flex items-center gap-2"
            >
              <Calendar className="w-4 h-4 text-brand" />
              <span className="text-left leading-tight">
                Présence du<br/>Jour (PDF)
              </span>
            </button>

            <button
              onClick={() => exportAttendancePDF({ year: selectedYear, month: selectedMonth })}
              className="px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold shadow-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all flex items-center gap-2"
            >
              <FileText className="w-4 h-4 text-red-500" />
              <span className="text-left leading-tight">
                Rapport<br/>Mensuel (PDF)
              </span>
            </button>

            <button
              onClick={() => exportAttendanceXLSX({ year: selectedYear, month: selectedMonth })}
              className="px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold shadow-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-650" />
              <span className="text-left leading-tight">
                Rapport<br/>Mensuel (Excel)
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Pointage display */}
      {activeEmployees.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl p-8 text-center shadow-sm">
          <CalendarDays className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700 dark:text-slate-300 mb-1">Aucun employé actif</h3>
          <p className="text-xs text-slate-400">Il n'y a aucun employé actif affecté à ce site pour le moment.</p>
        </div>
      ) : (
        <>
          {/* GRID DISPLAY (Visible on large screen, or on small screen if display mode is 'grid') */}
          <div className={`${mobileDisplayMode === 'grid' ? 'block' : 'hidden lg:block'} bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden`}>
            <div className="overflow-x-auto max-w-full">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-4 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 w-44">
                      Employé
                    </th>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const day = i + 1;
                      const dateObj = new Date(selectedYear, selectedMonth, day);
                      const isSunday = dateObj.getDay() === 0;
                      const isSaturday = dateObj.getDay() === 6;
                      const isSundayVisible = showSundays || visibleSundays.includes(`${selectedYear}-${selectedMonth}-${day}`);
                      if (isSunday && !isSundayVisible) return null;

                      // Check if the next day (Sunday) is already visible
                      const nextSundayKey = `${selectedYear}-${selectedMonth}-${day + 1}`;
                      const isNextSundayVisible = visibleSundays.includes(nextSundayKey);
                      const isDayToday = isToday(day);

                      return (
                        <th 
                          key={day} 
                          className={`px-1 py-4 text-center text-xs font-bold w-9 border-l border-slate-100 dark:border-slate-800/80 relative group ${
                            isDayToday 
                              ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 ring-2 ring-amber-500 font-extrabold z-10' 
                              : isSunday ? 'text-red-500 bg-red-50/20 dark:bg-red-950/10' : 'text-slate-500'
                          }`}
                        >
                          {/* Plus button on Saturdays to add adjacent Sunday */}
                          {isSaturday && !showSundays && (
                            <button
                              onClick={() => toggleSundayVisibility(day + 1)}
                              className={`absolute top-0.5 left-1/2 -translate-x-1/2 p-0.5 rounded-full shadow-sm border transition-all z-20 ${
                                isNextSundayVisible 
                                  ? 'bg-red-500 border-red-600 text-white hover:scale-110' 
                                  : 'bg-emerald-100 border-emerald-700 text-emerald-800 hover:scale-110'
                              }`}
                              title={isNextSundayVisible ? "Masquer le dimanche" : "Afficher le dimanche suivant"}
                            >
                              {isNextSundayVisible ? (
                                <X className="w-2 h-2 stroke-[3]" />
                              ) : (
                                <Plus className="w-2 h-2 stroke-[3]" />
                              )}
                            </button>
                          )}

                          {/* Close button on visible Sundays header to hide it */}
                          {isSunday && !showSundays && (
                            <button
                              onClick={() => toggleSundayVisibility(day)}
                              className="absolute top-0.5 left-1/2 -translate-x-1/2 p-0.5 rounded-full bg-red-100 border border-red-600 text-red-600 shadow-sm hover:scale-110 transition-all opacity-0 group-hover:opacity-100 z-20"
                              title="Masquer ce dimanche"
                            >
                              <X className="w-2 h-2 stroke-[3]" />
                            </button>
                          )}

                          <div className="mt-1">{day}</div>
                          <div className="text-4xs font-medium uppercase mt-0.5">
                            {dateObj.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 2)}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {activeEmployees.map(emp => (
                    <tr key={emp.id} className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                      <td className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-100 dark:border-slate-800 w-44 truncate">
                        {emp.nom} {emp.prenom}
                        <div className="text-4xs font-normal text-slate-400 mt-0.5 capitalize">
                          {emp.type === 'permanent' ? 'Permanent' : 'Temporaire'}
                        </div>
                      </td>
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        const isSunday = new Date(selectedYear, selectedMonth, day).getDay() === 0;
                        const isSundayVisible = showSundays || visibleSundays.includes(`${selectedYear}-${selectedMonth}-${day}`);
                        if (isSunday && !isSundayVisible) return null;

                        const isInactive = isBeforeStart(emp, day) || isDismissed(emp, day);
                        const status = resolveStatus(emp, day);
                        const isDayToday = isToday(day);

                        return (
                          <td 
                            key={day} 
                            className={`p-0.5 border-r border-slate-100 dark:border-slate-800/80 ${
                              isDayToday ? 'ring-2 ring-amber-400 bg-amber-50/20 dark:bg-amber-950/10 z-10' : isSunday ? 'bg-red-50/10 dark:bg-red-950/5' : ''
                            }`}
                          >
                            <button
                              disabled={isInactive}
                              onClick={() => toggleStatus(emp.id, day)}
                              className={`w-full h-8 rounded-lg flex items-center justify-center transition-all ${
                                getCellBgColor(status, isInactive, isSunday)
                              }`}
                              title={isInactive ? 'Hors contrat' : `${emp.nom} : ${getStatusText(status)}`}
                            >
                              {!isInactive && getCellIcon(status)}
                              {isInactive && <span className="text-2xs text-slate-300">-</span>}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* DAILY LIST CONTROLLER (Visible on mobile/tablet ONLY when mode is 'daily') */}
          <div className={`${mobileDisplayMode === 'daily' ? 'flex lg:hidden' : 'hidden'} flex-col gap-4 max-w-md w-full mx-auto`}>
            
            {/* Day Selector bar */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-3 rounded-2xl shadow-sm flex items-center justify-between">
              <button
                disabled={selectedDayMobile <= 1}
                onClick={() => setSelectedDayMobile(d => d - 1)}
                className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-30 transition-all"
              >
                <ChevronLeft className="w-4.5 h-4.5" />
              </button>

              <div className="text-center">
                <span className="text-4xs font-extrabold text-slate-400 uppercase tracking-widest block">Jour Sélectionné</span>
                <span className="text-sm font-extrabold text-slate-800 dark:text-white font-sans">
                  {selectedDayMobile} {MONTHS[selectedMonth]} {selectedYear}
                </span>
                <span className={`text-4xs font-bold block uppercase mt-0.5 ${
                  new Date(selectedYear, selectedMonth, selectedDayMobile).getDay() === 0 ? 'text-red-500' : 'text-slate-400'
                }`}>
                  {new Date(selectedYear, selectedMonth, selectedDayMobile).toLocaleDateString('fr-FR', { weekday: 'long' })}
                </span>
              </div>

              <button
                disabled={selectedDayMobile >= daysInMonth}
                onClick={() => setSelectedDayMobile(d => d + 1)}
                className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-30 transition-all"
              >
                <ChevronRight className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* List of Employees for selected day */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-sm p-3.5 flex flex-col gap-2">
              {activeEmployees.map(emp => {
                const isInactive = isBeforeStart(emp, selectedDayMobile) || isDismissed(emp, selectedDayMobile);
                const status = resolveStatus(emp, selectedDayMobile);
                const isSunday = new Date(selectedYear, selectedMonth, selectedDayMobile).getDay() === 0;

                return (
                  <div 
                    key={emp.id}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/40"
                  >
                    <div>
                      <h4 className="font-bold text-xs text-slate-800 dark:text-white">
                        {emp.nom} {emp.prenom}
                      </h4>
                      <p className="text-4xs text-slate-400 font-medium capitalize mt-0.5">
                        {emp.type === 'permanent' ? 'Permanent' : 'Temporaire'}
                      </p>
                    </div>

                    <div>
                      {isInactive ? (
                        <span className="text-4xs italic text-slate-400">Contrat inactif</span>
                      ) : (
                        <button
                          onClick={() => toggleStatus(emp.id, selectedDayMobile)}
                          className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-3xs font-extrabold shadow-sm transition-all ${
                            getCellBgColor(status, false, isSunday)
                          }`}
                        >
                          {getCellIcon(status)}
                          {getStatusText(status)}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

    </div>
  );
};
