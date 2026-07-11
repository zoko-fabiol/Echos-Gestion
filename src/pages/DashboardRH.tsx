import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DailyRecord, Quote } from '../db/database';
import { useAuth } from '../context/AuthContext';
import { 
  Users, Calendar, Coins, ArrowUpRight, BarChart3, 
  TrendingUp, ShoppingBag, Eye, CalendarDays, Search 
} from 'lucide-react';
import { SITES, MONTHS } from '../config/constants';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { useExports } from '../hooks/useExports';
import { InvoicePreviewModal, InvoiceData } from '../components/modals/InvoicePreviewModal';
import { syncUp } from '../services/syncEngine';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

export const DashboardRH: React.FC = () => {
  const { hasAccess } = useAuth();
  const { generateInvoicePDF } = useExports();

  // Dexie Queries - RH
  const rhData = useLiveQuery(() => db.rhAppData.get('rh_app_data'));
  const employees = rhData?.value?.employees || [];
  const attendance = rhData?.value?.attendance || {};
  const payrollExtras = rhData?.value?.payrollExtras || {};

  // Dexie Queries - Bilan & Commercial
  const dailyRecords = useLiveQuery(() => db.dailyRecords.toArray()) || [];
  const quotes = useLiveQuery(() => db.quotes.toArray()) || [];

  // Local States for Bilan/Sales section
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(-1);
  const [activeTab, setActiveTab] = useState<'sales' | 'deliveries'>('sales');
  
  // Print Preview Dialog States
  const [selectedRecord, setSelectedRecord] = useState<DailyRecord | Quote | null>(null);
  const [previewType, setPreviewType] = useState<'sale' | 'delivery'>('sale');

  // --- RH METRICS & CALCULATIONS ---
  const totalEmployees = employees.length;
  const activeEmployees = employees.filter(e => e.statut !== 'renvoye');
  const activeCount = activeEmployees.length;

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const currentDay = new Date().getDate();

  // Calculate Payroll expenses for this month
  const keyMonth = `${currentYear}-${currentMonth}`;
  const joursOuvrables = 22;
  
  const payrollDetails = activeEmployees.map(emp => {
    const extrasKey = `${emp.id}_${keyMonth}`;
    const extras = payrollExtras[extrasKey] || { prime: 0, dette: 0, retenue: 0 };
    
    // Count unpaid absences
    let absentCount = 0;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(currentYear, currentMonth, d);
      const isSunday = dateObj.getDay() === 0;

      if (emp.statut === 'renvoye' && emp.dateRenvoi) {
        const dismissalDate = new Date(emp.dateRenvoi);
        dismissalDate.setHours(0, 0, 0, 0);
        dateObj.setHours(0, 0, 0, 0);
        if (dateObj > dismissalDate) continue;
      }
      
      if (emp.dateEmbauche) {
        const startDate = new Date(emp.dateEmbauche);
        startDate.setHours(0, 0, 0, 0);
        dateObj.setHours(0, 0, 0, 0);
        if (dateObj < startDate) continue;
      }

      const key = `${emp.id}_${currentYear}-${currentMonth}-${d}`;
      const status = attendance[key];
      
      if (status === 2 && !isSunday) {
        absentCount++;
      }
    }

    const baseSalary = emp.salaireBase;
    const retenueAbsence = Math.round((baseSalary / joursOuvrables) * absentCount);
    const net = Math.max(0, Math.round(baseSalary + extras.prime - extras.dette - extras.retenue - retenueAbsence));
    
    return { baseSalary, net };
  });

  const totalPayrollCost = payrollDetails.reduce((acc, curr) => acc + curr.net, 0);

  // Attendance rate today
  let presentCount = 0;
  activeEmployees.forEach(emp => {
    const key = `${emp.id}_${currentYear}-${currentMonth}-${currentDay}`;
    let status = attendance[key];
    
    if (status === undefined) {
      status = emp.type === 'temporaire' ? 3 : 1; 
    }

    if (status === 1 || status === 3) {
      presentCount++;
    }
  });

  const attendanceRateToday = activeCount > 0 ? Math.round((presentCount / activeCount) * 100) : 0;

  // Distribution configurations
  const siteDistribution = SITES.reduce((acc, site) => {
    acc[site] = activeEmployees.filter(e => e.site === site).length;
    return acc;
  }, {} as Record<string, number>);

  const typeDistribution = {
    permanent: activeEmployees.filter(e => e.type === 'permanent').length,
    temporaire: activeEmployees.filter(e => e.type === 'temporaire').length
  };

  // --- COMMERCE & STATS CALCULATIONS ---
  const stats = useMemo(() => {
    const filterByDate = (dateStr: string) => {
      const d = new Date(dateStr);
      const yearMatch = d.getFullYear() === selectedYear;
      const monthMatch = selectedMonth === -1 ? true : d.getMonth() === selectedMonth;
      return yearMatch && monthMatch;
    };

    const periodSales = dailyRecords.filter(r => filterByDate(r.date));
    const periodDeliveries = quotes.filter(q => filterByDate(q.date));

    const totalCA = periodSales.reduce((sum, r) => sum + r.total, 0);
    const totalCost = periodSales.reduce((sum, r) => sum + r.totalCost, 0);
    const totalMargin = totalCA - totalCost;
    const salesCount = periodSales.length;

    const monthlyCA = Array(12).fill(0);
    dailyRecords
      .filter(r => new Date(r.date).getFullYear() === selectedYear)
      .forEach(r => {
        const m = new Date(r.date).getMonth();
        monthlyCA[m] += r.total;
      });

    return {
      periodSales,
      periodDeliveries,
      totalCA,
      totalMargin,
      salesCount,
      monthlyCA
    };
  }, [dailyRecords, quotes, selectedYear, selectedMonth]);

  const filteredSales = useMemo(() => {
    return stats.periodSales.filter(s => {
      return (
        s.id.toString().includes(searchTerm) ||
        (s.items || []).some(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    });
  }, [stats.periodSales, searchTerm]);

  const filteredDeliveries = useMemo(() => {
    return stats.periodDeliveries.filter(q => {
      return (
        q.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.id.toString().includes(searchTerm) ||
        (q.items || []).some(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    });
  }, [stats.periodDeliveries, searchTerm]);

  // --- ACTION HANDLERS ---
  const handleOpenPreview = (record: DailyRecord | Quote, type: 'sale' | 'delivery') => {
    setSelectedRecord(record);
    setPreviewType(type);
  };

  const handleSaveInvoice = async (updated: InvoiceData) => {
    if (updated.type === 'sale') {
      const record = dailyRecords.find(r => r.id === updated.id);
      if (record) {
        const payload: DailyRecord = {
          ...record,
          date: updated.date,
        };
        await db.dailyRecords.put(payload);
      }
    } else {
      const quote = quotes.find(q => q.id === updated.id);
      if (quote) {
        const payload: Quote = {
          ...quote,
          clientName: updated.clientName || quote.clientName,
          clientPhone: updated.clientPhone || quote.clientPhone,
          date: updated.date
        };
        await db.quotes.put(payload);
      }
    }
    setSelectedRecord(null);
    syncUp().catch(err => console.warn('Background sync failed', err));
  };

  // --- CHART CONFIGS ---
  const siteChartData = {
    labels: Object.keys(siteDistribution),
    datasets: [
      {
        label: 'Employés actifs',
        data: Object.values(siteDistribution),
        backgroundColor: '#14522D',
        borderRadius: 8,
      }
    ]
  };

  const typeChartData = {
    labels: ['CDD / CDI', 'Temporaire'],
    datasets: [
      {
        data: [typeDistribution.permanent, typeDistribution.temporaire],
        backgroundColor: ['#14522D', '#eab308'],
        borderWidth: 0,
      }
    ]
  };

  const lineChartData = {
    labels: MONTHS,
    datasets: [
      {
        label: `C.A. ${selectedYear} (FCFA)`,
        data: stats.monthlyCA,
        borderColor: '#14522D',
        backgroundColor: 'rgba(20, 82, 45, 0.1)',
        tension: 0.3,
        fill: true,
      }
    ]
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: any) => `${(value / 1000).toFixed(0)}k F`
        }
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-scale">
      
      {/* 1. Statistics / KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        
        {/* KPI: Total Employees */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-5 rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">Effectif Total</span>
            <span className="text-2xl font-extrabold text-slate-800 dark:text-white font-sans block mt-1">{totalEmployees}</span>
            <span className="text-xs text-emerald-500 font-medium mt-1 inline-flex items-center gap-0.5">
              <ArrowUpRight className="w-3.5 h-3.5" />
              {activeCount} Actifs
            </span>
          </div>
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/20 text-brand rounded-2xl">
            <Users className="w-6 h-6 text-brand" />
          </div>
        </div>

        {/* KPI: Attendance Rate */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-5 rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">Présence Aujourd'hui</span>
            <span className="text-2xl font-extrabold text-slate-800 dark:text-white font-sans block mt-1">{attendanceRateToday}%</span>
            <span className="text-xs text-slate-400 font-medium mt-1 block">
              {presentCount} / {activeCount} présents
            </span>
          </div>
          <div className="p-3.5 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-600 rounded-2xl">
            <Calendar className="w-6 h-6" />
          </div>
        </div>

        {/* KPI: Turnover (Commercial Bilan) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-5 rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">Chiffre d'Affaires</span>
            <span className="text-2xl font-extrabold text-slate-800 dark:text-white font-mono block mt-1">{stats.totalCA.toLocaleString()} F</span>
            <span className="text-xs text-slate-400 font-medium mt-1 block">
              Cumulé sur la période
            </span>
          </div>
          <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 rounded-2xl">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* KPI: Estimated Wages (RH) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-5 rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">Masse Salariale Estimée</span>
            <span className="text-2xl font-extrabold text-brand font-mono block mt-1">{totalPayrollCost.toLocaleString()} F</span>
            <span className="text-xs text-slate-400 font-medium mt-1 block">
              Mois en cours RH
            </span>
          </div>
          <div className="p-3.5 bg-red-50 dark:bg-red-950/20 text-red-500 rounded-2xl">
            <Coins className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* 2. Analytical Charts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Line Chart: Monthly CA Progression (Bilan) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-5 rounded-2xl xl:col-span-2 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-brand" />
            <h4 className="font-bold text-slate-800 dark:text-white text-sm">Évolution Mensuelle du C.A.</h4>
          </div>
          <div className="h-56 relative">
            <Line data={lineChartData} options={lineChartOptions} />
          </div>
        </div>

        {/* Doughnut Chart: Contract Statut (RH) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-brand" />
            <h4 className="font-bold text-slate-800 dark:text-white text-sm">Statut des Contrats</h4>
          </div>
          <div className="flex-1 min-h-[160px] flex items-center justify-center">
            {activeCount > 0 ? (
              <div className="max-w-[160px] w-full">
                <Doughnut 
                  data={typeChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                      legend: { position: 'bottom', labels: { boxWidth: 10, padding: 10 } }
                    }
                  }}
                />
              </div>
            ) : (
              <span className="text-sm italic text-slate-400">Aucun employé actif.</span>
            )}
          </div>
        </div>

      </div>

      {/* 3. Filtering & Search Toolbar for Sales List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-brand" />
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value={-1}>Toute l'année</option>
              {MONTHS.map((m: string, idx: number) => <option key={idx} value={idx}>{m}</option>)}
            </select>

            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              {[2025, 2026, 2027].map((y: number) => <option key={y} value={y}>{y}</option>)}
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

        {/* Sub-tab selection for transaction history */}
        <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border dark:border-slate-800 max-w-xs self-stretch md:self-auto">
          <button 
            onClick={() => { setActiveTab('sales'); setSearchTerm(''); }}
            className={`flex-1 py-1.5 px-4 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'sales' 
                ? 'bg-white dark:bg-slate-800 text-brand shadow-sm' 
                : 'text-slate-500 hover:bg-slate-200/40 dark:hover:bg-slate-800/40'
            }`}
          >
            Factures POS
          </button>
          <button 
            onClick={() => { setActiveTab('deliveries'); setSearchTerm(''); }}
            className={`flex-1 py-1.5 px-4 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'deliveries' 
                ? 'bg-white dark:bg-slate-800 text-brand shadow-sm' 
                : 'text-slate-500 hover:bg-slate-200/40 dark:hover:bg-slate-800/40'
            }`}
          >
            Bons Livraisons
          </button>
        </div>

      </div>

      {/* 4. POS / Deliveries lists */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-sm flex flex-col overflow-hidden">
        
        {activeTab === 'sales' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                  <th className="table-header">Référence</th>
                  <th className="table-header">Date</th>
                  <th className="table-header text-right">Items vendus</th>
                  <th className="table-header text-right">Chiffre d'Affaires</th>
                  <th className="table-header text-right">Marge Bénéf.</th>
                  <th className="table-header text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm italic text-slate-400">
                      Aucune transaction trouvée pour cette période.
                    </td>
                  </tr>
                ) : (
                  filteredSales.sort((a,b) => b.id - a.id).map(s => {
                    const margin = s.total - s.totalCost;
                    return (
                      <tr key={s.id} className="table-row">
                        <td className="table-cell font-bold text-slate-700 dark:text-slate-300">
                          FAC-{s.id.toString().slice(-6)}
                        </td>
                        <td className="table-cell font-mono text-xs">
                          {new Date(s.date).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="table-cell text-right font-semibold">
                          {s.items.reduce((sum, i) => sum + i.qty, 0)} u.
                        </td>
                        <td className="table-cell text-right font-mono font-bold text-brand">
                          {s.total.toLocaleString()} F
                        </td>
                        <td className="table-cell text-right font-mono text-emerald-600 font-semibold">
                          +{margin.toLocaleString()} F
                        </td>
                        <td className="table-cell text-center">
                          <button 
                            onClick={() => handleOpenPreview(s, 'sale')}
                            className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-brand transition-colors"
                          >
                            <Eye className="w-4.5 h-4.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                  <th className="table-header">Référence</th>
                  <th className="table-header">Date</th>
                  <th className="table-header">Destinataire</th>
                  <th className="table-header text-right">Volume Livré</th>
                  <th className="table-header text-right">Valeur Estimée</th>
                  <th className="table-header text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeliveries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm italic text-slate-400">
                      Aucun bon de livraison enregistré.
                    </td>
                  </tr>
                ) : (
                  filteredDeliveries.sort((a,b) => b.id - a.id).map(q => {
                    return (
                      <tr key={q.id} className="table-row">
                        <td className="table-cell font-bold text-slate-700 dark:text-slate-300">
                          BON-{q.id.toString().slice(-6)}
                        </td>
                        <td className="table-cell font-mono text-xs">
                          {new Date(q.date).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="table-cell font-semibold">{q.clientName}</td>
                        <td className="table-cell text-right font-semibold">
                          {q.items.reduce((sum, i) => sum + i.qty, 0)} u.
                        </td>
                        <td className="table-cell text-right font-mono font-bold text-brand">
                          {q.total.toLocaleString()} F
                        </td>
                        <td className="table-cell text-center">
                          <button 
                            onClick={() => handleOpenPreview(q, 'delivery')}
                            className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-brand transition-colors"
                          >
                            <Eye className="w-4.5 h-4.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* Print Preview Modal */}
      {selectedRecord && (
        <InvoicePreviewModal
          isOpen={!!selectedRecord}
          onClose={() => setSelectedRecord(null)}
          data={{
            id: selectedRecord.id,
            date: selectedRecord.date,
            clientName: previewType === 'sale' ? 'Client Comptoir' : (selectedRecord as Quote).clientName,
            clientPhone: previewType === 'sale' ? '' : (selectedRecord as Quote).clientPhone,
            items: selectedRecord.items.map(i => ({
              name: i.name,
              qty: i.qty,
              price: i.price,
              initialStock: (i as any).initialStock,
              finalStock: (i as any).finalStock,
              unit: (i as any).unit || (i as any).saleUnit
            })),
            type: previewType,
            total: selectedRecord.total
          }}
          onSave={handleSaveInvoice}
        />
      )}

    </div>
  );
};
