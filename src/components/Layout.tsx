import React, { useState } from 'react';
import { useAuth, TabId } from '../context/AuthContext';
import { useBackupScheduler } from '../hooks/useBackupScheduler';
import { AppLogo } from './AppLogo';
import { 
  LayoutDashboard, Users, CalendarDays, Coins, 
  LayoutGrid, ShoppingCart, Package, CreditCard, 
  Factory, BarChart3, ShieldAlert, Settings, 
  LogOut, Lock, Menu, X, MoreHorizontal, 
  Wifi, WifiOff, RefreshCw, ChevronLeft, ChevronRight 
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab }) => {
  const { currentUser, logout, isOnline, hasAccess } = useAuth();
  
  // Initialize backup check hook
  useBackupScheduler();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobilePlusOpen, setMobilePlusOpen] = useState(false);

  // Sync state (can listen to sync engine state in real app, we will mock it or tie to windows sync state)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('ok');

  // Listen to sync engine event updates
  React.useEffect(() => {
    const handleSyncStatus = (e: Event) => {
      const status = (e as CustomEvent).detail?.status;
      if (status) setSyncStatus(status);
    };
    window.addEventListener('sync-status-change', handleSyncStatus);
    return () => window.removeEventListener('sync-status-change', handleSyncStatus);
  }, []);

  const allNavigationItems = [
    // --- SECTION RH ---
    { id: 'dashboard', label: 'RH Tableau de bord', icon: LayoutDashboard, section: 'rh' },
    { id: 'employes', label: 'Effectifs', icon: Users, section: 'rh' },
    { id: 'pointage', label: 'Présences / Pointage', icon: CalendarDays, section: 'rh' },
    { id: 'salaires', label: 'Calcul des Salaires', icon: Coins, section: 'rh' },
    
    // --- SECTION STOCK / POS ---
    { id: 'catalogue', label: 'Catalogue', icon: LayoutGrid, section: 'stock' },
    { id: 'caisse', label: 'Caisse / POS', icon: ShoppingCart, section: 'stock' },
    { id: 'stock', label: 'Inventaire', icon: Package, section: 'stock' },
    { id: 'transactions', label: 'Transactions & Dépenses', icon: CreditCard, section: 'stock' },
    { id: 'production', label: 'Suivi de Production', icon: Factory, section: 'stock' },
    
    // --- ADMIN & PARAMÈTRES ---
    { id: 'comptes', label: 'Utilisateurs', icon: ShieldAlert, section: 'admin' },
    { id: 'settings', label: 'Paramètres', icon: Settings, section: 'admin' }
  ] as const;

  // Filter items by current user permissions
  const allowedNavItems = allNavigationItems.filter(item => hasAccess(item.id, 'view'));

  // Mobile Bottom Nav Main items (Max 4 items + Plus)
  const mobileMainItems = allowedNavItems.filter(item => 
    ['dashboard', 'employes', 'pointage', 'salaires'].includes(item.id)
  );

  // Mobile Secondary items (for the 'Plus' menu popup)
  const mobilePlusItems = allowedNavItems.filter(item => 
    !['dashboard', 'employes', 'pointage', 'salaires'].includes(item.id)
  );

  const getSectionTitle = (sectionName: string) => {
    switch (sectionName) {
      case 'rh': return 'Ressources Humaines';
      case 'stock': return 'Stock & Ventes';
      case 'admin': return 'Administration';
      default: return '';
    }
  };

  const getTabLabel = (id: TabId) => {
    return allNavigationItems.find(item => item.id === id)?.label || '';
  };

  const handleTabChange = (id: TabId) => {
    setActiveTab(id);
    setMobileMenuOpen(false);
    setMobilePlusOpen(false);
  };

  const getSyncIcon = () => {
    switch (syncStatus) {
      case 'syncing': return <RefreshCw className="w-4 h-4 text-brand animate-spin" />;
      case 'ok': return <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" title="Synchronisé" />;
      case 'error': return <span className="w-2.5 h-2.5 bg-red-500 rounded-full" title="Erreur de synchro" />;
      default: return <span className="w-2.5 h-2.5 bg-slate-400 rounded-full" title="Inactif" />;
    }
  };

  return (
    <div className="h-full flex overflow-hidden bg-slate-50 dark:bg-slate-950">
      
      {/* ========================================================= */}
      {/* 1. DESKTOP SIDEBAR NAVIGATION                             */}
      {/* ========================================================= */}
      <aside 
        className={`hidden lg:flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 relative ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Sidebar Header */}
        <div className={`p-5 flex items-center border-b border-slate-100 dark:border-slate-800/80 ${
          sidebarCollapsed ? 'justify-center' : 'justify-between'
        }`}>
          {/* Logo — shown in both expanded and collapsed mode */}
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-3">
              <AppLogo size={36} fallback={
                <div className="w-9 h-9 bg-brand rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-md shadow-brand/20">E</div>
              } />
              <span className="font-extrabold text-xl tracking-tight text-slate-800 dark:text-white font-sans">
                Echo Gestion
              </span>
            </div>
          ) : (
            <AppLogo size={36} fallback={
              <div className="w-9 h-9 bg-brand rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-md shadow-brand/20">E</div>
            } />
          )}
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {sidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-6">
          {['rh', 'stock', 'admin'].map(sectionName => {
            const sectionItems = allowedNavItems.filter(item => item.section === sectionName);
            if (sectionItems.length === 0) return null;

            return (
              <div key={sectionName} className="flex flex-col gap-2">
                {!sidebarCollapsed && (
                  <span className="px-3 text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    {getSectionTitle(sectionName)}
                  </span>
                )}
                <div className="flex flex-col gap-1">
                  {sectionItems.map(item => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabChange(item.id)}
                        title={sidebarCollapsed ? item.label : undefined}
                        className={`group px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium transition-all duration-200 ${
                          isActive 
                            ? 'bg-brand text-white shadow-md shadow-brand/10' 
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100'
                        }`}
                      >
                        <Icon className={`w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110 duration-200 ${
                          isActive ? 'text-white' : 'text-slate-400 dark:text-slate-500'
                        }`} />
                        {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* User Session Info & Lock/Logout */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800/80 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-brand uppercase">
              {currentUser?.displayName?.substring(0, 2) || currentUser?.email.substring(0, 2) || 'US'}
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {currentUser?.displayName || 'Session Utilisateur'}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 truncate capitalize">
                  Rôle: {currentUser?.role}
                </p>
              </div>
            )}
          </div>
          
          {!sidebarCollapsed && (
            <button 
              onClick={logout}
              className="w-full py-2 bg-slate-50 hover:bg-red-50 hover:text-red-600 dark:bg-slate-800/50 dark:hover:bg-red-950/20 dark:hover:text-red-400 text-slate-600 dark:text-slate-400 text-xs font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 border border-slate-200/50 dark:border-slate-700/30"
            >
              <LogOut className="w-3.5 h-3.5" />
              Se déconnecter
            </button>
          )}
        </div>
      </aside>

      {/* ========================================================= */}
      {/* 2. MAIN APPLICATION CONTENT WRAPPER                       */}
      {/* ========================================================= */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* Top Header */}
        <header className="h-16 flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800/80 px-6 flex items-center justify-between z-25">
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle (unused since mobile bottom nav is preferred, but here for header toggle if needed) */}
            <h1 className="text-lg font-bold text-slate-800 dark:text-white capitalize flex items-center gap-2">
              <AppLogo size={28} fallback={
                <span className="font-extrabold text-brand font-sans tracking-tight lg:hidden">E.G</span>
              } />
              <span className="text-slate-400 dark:text-slate-600 lg:hidden">|</span>
              {getTabLabel(activeTab)}
            </h1>
          </div>

          {/* Network & Sync Status Header Panel */}
          <div className="flex items-center gap-4">
            {/* Connection state */}
            <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 rounded-full">
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-2xs font-semibold text-slate-600 dark:text-slate-400 hidden sm:inline">En Ligne</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                  <span className="text-2xs font-semibold text-slate-600 dark:text-slate-400 hidden sm:inline">Hors Ligne</span>
                </>
              )}
            </div>

            {/* Sync State Indicator */}
            {isOnline && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 rounded-full">
                {getSyncIcon()}
                <span className="text-2xs font-semibold text-slate-600 dark:text-slate-400 hidden sm:inline uppercase">
                  {syncStatus === 'syncing' ? 'Sync...' : syncStatus === 'ok' ? 'Cloud OK' : 'Cloud Err'}
                </span>
              </div>
            )}

            {/* Logout icon shortcut on mobile/tablet */}
            <button
              onClick={logout}
              className="p-2 bg-slate-50 hover:bg-red-50 hover:text-red-500 dark:bg-slate-800/50 dark:hover:bg-slate-800 rounded-xl text-slate-500 lg:hidden transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Viewport for Pages */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-36 lg:pb-6 bg-slate-50 dark:bg-slate-950">
          {children}
          {/* Safety spacer to prevent content from being hidden behind the mobile bottom nav bar */}
          <div className="h-24 w-full lg:hidden flex-shrink-0" />
        </main>
      </div>

      {/* ========================================================= */}
      {/* 3. MOBILE BOTTOM NAVIGATION                               */}
      {/* ========================================================= */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800/80 px-4 flex items-center justify-between z-40">
        
        {/* Render maximum 4 priority items first */}
        {mobileMainItems.slice(0, 4).map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              className={`flex-1 py-1.5 flex flex-col items-center justify-center gap-1 rounded-xl transition-all ${
                isActive 
                  ? 'text-brand font-bold scale-105' 
                  : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-400'
              }`}
            >
              <Icon className="w-5.5 h-5.5" />
              <span className="text-3xs uppercase tracking-wider font-semibold truncate max-w-[70px]">
                {item.label}
              </span>
            </button>
          );
        })}

        {/* "Plus" (More) trigger button */}
        {mobilePlusItems.length > 0 && (
          <button
            onClick={() => setMobilePlusOpen(!mobilePlusOpen)}
            className={`flex-1 py-1.5 flex flex-col items-center justify-center gap-1 rounded-xl transition-all ${
              mobilePlusOpen 
                ? 'text-brand font-bold' 
                : 'text-slate-400 hover:text-slate-600 dark:text-slate-500'
            }`}
          >
            <MoreHorizontal className="w-5.5 h-5.5" />
            <span className="text-3xs uppercase tracking-wider font-semibold">Plus</span>
          </button>
        )}
      </nav>

      {/* ========================================================= */}
      {/* 4. MOBILE "PLUS" MENU SLIDE-UP SHEET/POPUP                 */}
      {/* ========================================================= */}
      {mobilePlusOpen && (
        <div className="lg:hidden fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-30" onClick={() => setMobilePlusOpen(false)}>
          <div 
            className="absolute bottom-16 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-6 rounded-t-3xl max-h-[75vh] overflow-y-auto animate-slide-up flex flex-col gap-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Autres Sections</h3>
              <button 
                onClick={() => setMobilePlusOpen(false)}
                className="p-1 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List of other sections grouped by category */}
            {['rh', 'stock', 'admin'].map(sectionName => {
              const sectionItems = mobilePlusItems.filter(item => item.section === sectionName);
              if (sectionItems.length === 0) return null;

              return (
                <div key={sectionName} className="flex flex-col gap-2">
                  <span className="text-3xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    {getSectionTitle(sectionName)}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {sectionItems.map(item => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleTabChange(item.id)}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium transition-all ${
                            isActive 
                              ? 'bg-brand/10 border-brand text-brand' 
                              : 'bg-slate-50 border-slate-100 hover:bg-slate-100 dark:bg-slate-950 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <Icon className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? 'text-brand' : 'text-slate-400'}`} />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
