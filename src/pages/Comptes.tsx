import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, UserAccount } from '../db/database';
import { useAuth, hashString } from '../context/AuthContext';
import { 
  ShieldAlert, UserCheck, UserX, Plus, Edit2, 
  Trash2, Save, X, Key, Mail, Shield, Eye,
  LayoutDashboard, Users, CalendarDays, Coins, 
  LayoutGrid, ShoppingCart, Package, CreditCard, 
  Factory, Settings
} from 'lucide-react';
import { showToast } from '../components/ui/Toast';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import { syncUp } from '../services/syncEngine';
import { Modal } from '../components/ui/Modal';

export const Comptes: React.FC = () => {
  const { currentUser, hasAccess } = useAuth();
  
  const users = useLiveQuery(() => db.userAccounts.toArray()) || [];

  // Modal State
  const [showModal, setShowModal] = useState(false);

  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');

  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);

  const TAB_LABELS: Record<string, string> = {
    dashboard: 'RH Tableau de bord',
    employes: 'Effectifs',
    pointage: 'Présences / Pointage',
    salaires: 'Calcul des Salaires',
    catalogue: 'Catalogue',
    caisse: 'Caisse / POS',
    stock: 'Inventaire',
    transactions: 'Transactions & Dépenses',
    production: 'Suivi de Production',
    comptes: 'Utilisateurs',
    settings: 'Paramètres'
  };

  // Form Fields
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'user' | 'lecteur'>('lecteur');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active');
  const [formPassword, setFormPassword] = useState(''); // Used to pre-set offline hash

  // Granular Permissions Fields
  const [chatbotEnabled, setChatbotEnabled] = useState(true);
  const [tabPermissions, setTabPermissions] = useState<Record<string, { visible: boolean; add: boolean; edit: boolean; delete: boolean }>>({});
  const [activePopover, setActivePopover] = useState<string | null>(null);

  const handleRoleChange = (newRole: 'admin' | 'user' | 'lecteur') => {
    setFormRole(newRole);
    const initialPerms: Record<string, any> = {};
    Object.keys(TAB_LABELS).forEach(tab => {
      const isComptesOrSalaires = tab === 'comptes' || tab === 'settings'; // Restrict accounts and settings by default
      const isSensitiveRh = tab === 'salaires';
      
      if (newRole === 'admin') {
        initialPerms[tab] = { visible: true, add: true, edit: true, delete: true };
      } else if (newRole === 'user') {
        initialPerms[tab] = {
          visible: !isComptesOrSalaires && !isSensitiveRh,
          add: !isComptesOrSalaires && !isSensitiveRh,
          edit: !isComptesOrSalaires && !isSensitiveRh,
          delete: false
        };
      } else { // lecteur
        initialPerms[tab] = {
          visible: !isComptesOrSalaires && !isSensitiveRh,
          add: false,
          edit: false,
          delete: false
        };
      }
    });
    setTabPermissions(initialPerms);
  };

  const openAddModal = () => {
    if (currentUser?.role !== 'admin') {
      showToast('Accès restreint aux administrateurs.', 'error');
      return;
    }
    setModalMode('create');
    setSelectedUser(null);
    setFormEmail('');
    setFormName('');
    setFormStatus('active');
    setFormPassword('');
    setChatbotEnabled(true);
    setActivePopover(null);
    handleRoleChange('lecteur');
    setShowModal(true);
  };

  const openEditModal = (u: UserAccount) => {
    if (currentUser?.role !== 'admin') {
      showToast('Accès restreint aux administrateurs.', 'error');
      return;
    }
    setModalMode('edit');
    setSelectedUser(u);
    setFormEmail(u.email);
    setFormName(u.displayName || '');
    setFormRole(u.role);
    setFormStatus(u.status);
    setFormPassword('');
    setChatbotEnabled(u.permissions?.chatbotEnabled !== false);
    setActivePopover(null);

    const initialPerms: Record<string, any> = {};
    Object.keys(TAB_LABELS).forEach(tab => {
      if (u.permissions?.tabs?.[tab]) {
        initialPerms[tab] = { ...u.permissions.tabs[tab] };
      } else {
        const isComptesOrSalaires = tab === 'comptes' || tab === 'settings';
        const isSensitiveRh = tab === 'salaires';
        
        if (u.role === 'admin') {
          initialPerms[tab] = { visible: true, add: true, edit: true, delete: true };
        } else if (u.role === 'user') {
          initialPerms[tab] = {
            visible: !isComptesOrSalaires && !isSensitiveRh,
            add: !isComptesOrSalaires && !isSensitiveRh,
            edit: !isComptesOrSalaires && !isSensitiveRh,
            delete: false
          };
        } else { // lecteur
          initialPerms[tab] = {
            visible: !isComptesOrSalaires && !isSensitiveRh,
            add: false,
            edit: false,
            delete: false
          };
        }
      }
    });
    setTabPermissions(initialPerms);
    setShowModal(true);
  };

  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmail) {
      showToast('Adresse e-mail requise.', 'warning');
      return;
    }

    const uid = modalMode === 'edit' && selectedUser ? selectedUser.uid : `uid_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const email = formEmail.toLowerCase().trim();

    let hashedToken = selectedUser?.hashedToken || undefined;
    if (formPassword) {
      hashedToken = await hashString(email + formPassword);
    }

    const payload: UserAccount = {
      uid,
      email,
      displayName: formName.trim() || email.split('@')[0],
      role: formRole,
      status: formStatus,
      hashedToken,
      createdAt: selectedUser?.createdAt || Date.now(),
      updatedAt: Date.now(),
      permissions: formRole === 'admin' ? undefined : {
        chatbotEnabled,
        tabs: tabPermissions
      }
    };

    // Save in Dexie
    await db.userAccounts.put(payload);

    // Save in Firestore for verification
    const userDocRef = doc(firestore, 'userAccounts', uid);
    const syncUser = { ...payload };
    delete syncUser.hashedToken; // Keep token local only
    delete syncUser.lastEmailVerificationCheck;

    await setDoc(userDocRef, {
      ...syncUser,
      updatedAt: Date.now(),
      updatedBy: currentUser?.uid || 'admin'
    }, { merge: true });

    showToast(modalMode === 'edit' ? 'Utilisateur mis à jour !' : 'Nouvel utilisateur créé !', 'success');
    setShowModal(false);
    
    // Trigger syncup
    syncUp().catch(err => console.warn('POS background sync failed', err));
  };

  const toggleStatus = async (user: UserAccount) => {
    if (currentUser?.role !== 'admin') return;
    if (user.uid === currentUser?.uid) {
      showToast('Vous ne pouvez pas désactiver votre propre compte.', 'warning');
      return;
    }

    const nextStatus = user.status === 'active' ? 'inactive' : 'active';
    await db.userAccounts.update(user.uid, { status: nextStatus });
    
    // Sync with Firestore
    await setDoc(doc(firestore, 'userAccounts', user.uid), {
      status: nextStatus,
      updatedAt: Date.now()
    }, { merge: true });

    showToast(`Compte de ${user.email} ${nextStatus === 'active' ? 'activé' : 'désactivé'}.`, 'success');
    syncUp().catch(err => console.warn('Background sync failed', err));
  };

  const deleteUser = async (user: UserAccount) => {
    if (currentUser?.role !== 'admin') return;
    if (user.uid === currentUser?.uid) {
      showToast('Vous ne pouvez pas supprimer votre propre compte.', 'warning');
      return;
    }

    if (confirm(`Supprimer définitivement le compte de ${user.email} ?`)) {
      await db.userAccounts.delete(user.uid);
      await deleteDoc(doc(firestore, 'userAccounts', user.uid));
      showToast('Compte utilisateur supprimé.', 'success');
      syncUp().catch(err => console.warn('Background sync failed', err));
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-scale">
      
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Droits & Comptes Utilisateurs</h2>
          <p className="text-xs text-slate-400">Gérer les profils de connexion et rôles d'accès</p>
        </div>

        {currentUser?.role === 'admin' && (
          <button onClick={openAddModal} className="btn-primary py-2 text-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            Créer un compte
          </button>
        )}
      </div>

      {/* Grid List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                <th className="table-header">Nom Complet / Alias</th>
                <th className="table-header">Adresse E-mail</th>
                <th className="table-header text-center">Rôle / Accès</th>
                <th className="table-header text-center">Sécurité Hors ligne</th>
                <th className="table-header text-center">Statut</th>
                <th className="table-header text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf = u.uid === currentUser?.uid;
                
                return (
                  <tr key={u.uid} className="table-row">
                    <td className="table-cell font-semibold text-slate-800 dark:text-slate-100">
                      {u.displayName || 'Utilisateur'}
                      {isSelf && (
                        <span className="ml-2 px-2 py-0.5 bg-brand/10 text-brand text-4xs uppercase font-extrabold rounded-full">
                          Moi
                        </span>
                      )}
                    </td>
                    <td className="table-cell font-mono text-xs">{u.email}</td>
                    <td className="table-cell text-center">
                      <span className={`px-2.5 py-1 rounded-full text-3xs font-extrabold uppercase ${
                        u.role === 'admin' 
                          ? 'bg-red-500/10 text-red-600' 
                          : u.role === 'user'
                            ? 'bg-brand/10 text-brand'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}>
                        {u.role === 'admin' ? 'Administrateur' : u.role === 'user' ? 'Utilisateur' : 'Lecteur seul'}
                      </span>
                    </td>
                    <td className="table-cell text-center text-xs">
                      {u.hashedToken ? (
                        <span className="text-emerald-500 font-medium">Validé (Mémorisé)</span>
                      ) : (
                        <span className="text-slate-400 italic">Non configuré</span>
                      )}
                    </td>
                    <td className="table-cell text-center">
                      <button
                        disabled={isSelf}
                        onClick={() => toggleStatus(u)}
                        className={`px-3 py-1 rounded-xl text-3xs font-extrabold uppercase border transition-all ${
                          u.status === 'active'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/20'
                            : 'bg-red-500/10 border-red-500/20 text-red-600 hover:bg-red-500/20'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {u.status === 'active' ? 'Actif' : 'Désactivé'}
                      </button>
                    </td>
                    <td className="table-cell text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          disabled={!isSelf && currentUser?.role !== 'admin'}
                          onClick={() => openEditModal(u)}
                          className="p-1 text-slate-400 hover:text-brand transition-colors disabled:opacity-30"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          disabled={isSelf || currentUser?.role !== 'admin'}
                          onClick={() => deleteUser(u)}
                          className="p-1 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-30"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CRUD USER MODAL */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={modalMode === 'create' ? 'Créer un Compte' : 'Modifier le Compte'}
        size={formRole !== 'admin' ? 'lg' : 'md'}
      >
            <form onSubmit={saveUser} className="p-6 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
              
              <div>
                <label className="form-label">Adresse E-mail de connexion <span className="text-red-500">*</span></label>
                <div className="relative rounded-xl shadow-sm">
                  <Mail className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    disabled={modalMode === 'edit'}
                    value={formEmail}
                    onChange={e => setFormEmail(e.target.value)}
                    className="form-input pl-10"
                    placeholder="utilisateur@echosdechezmoi.com"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Nom / Alias de l'Utilisateur</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="form-input"
                  placeholder="ex. Ibrahim"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Rôle / Accès</label>
                  <select
                    value={formRole}
                    onChange={e => handleRoleChange(e.target.value as any)}
                    className="form-input font-semibold"
                  >
                    <option value="lecteur">Lecteur seul (Pas d'édits)</option>
                    <option value="user">Utilisateur (Pas d'admin)</option>
                    <option value="admin">Administrateur (Tout accès)</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Statut initial</label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as any)}
                    className="form-input font-semibold"
                  >
                    <option value="active">Actif</option>
                    <option value="inactive">Désactivé / Inactif</option>
                  </select>
                </div>
              </div>

              {formRole !== 'admin' && (
                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200/50 dark:border-slate-800/80">
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">Assistant IA (Copilote Chatbot)</h4>
                      <p className="text-4xs text-slate-400">Autoriser l'utilisateur à voir et interagir avec l'IA</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={chatbotEnabled} 
                        onChange={e => setChatbotEnabled(e.target.checked)}
                        className="sr-only peer" 
                      />
                      <div className="w-10 h-5 bg-slate-200 dark:bg-slate-750 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand"></div>
                    </label>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">Permissions d'accès aux onglets (Sélectionnez les onglets pour ajuster les droits)</h4>
                    <div className="flex flex-col gap-5">
                      {[
                        {
                          title: 'Ressources Humaines',
                          tabs: [
                            { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
                            { id: 'employes', label: 'Effectifs', icon: Users },
                            { id: 'pointage', label: 'Présences', icon: CalendarDays },
                            { id: 'salaires', label: 'Salaires', icon: Coins }
                          ]
                        },
                        {
                          title: 'Stock & Ventes',
                          tabs: [
                            { id: 'catalogue', label: 'Catalogue', icon: LayoutGrid },
                            { id: 'caisse', label: 'Caisse / POS', icon: ShoppingCart },
                            { id: 'stock', label: 'Inventaire', icon: Package },
                            { id: 'transactions', label: 'Transactions', icon: CreditCard },
                            { id: 'production', label: 'Production', icon: Factory }
                          ]
                        },
                        {
                          title: 'Administration',
                          tabs: [
                            { id: 'comptes', label: 'Utilisateurs', icon: ShieldAlert },
                            { id: 'settings', label: 'Paramètres', icon: Settings }
                          ]
                        }
                      ].map(sect => (
                        <div key={sect.title} className="flex flex-col gap-2.5">
                          <span className="text-4xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">
                            {sect.title}
                          </span>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {sect.tabs.map(tab => {
                              const p = tabPermissions[tab.id] || { visible: false, add: false, edit: false, delete: false };
                              const isTabActive = p.visible || p.add || p.edit || p.delete;
                              const TabIconComponent = tab.icon;

                              const updatePerm = (field: 'visible' | 'add' | 'edit' | 'delete', val: boolean) => {
                                setTabPermissions(prev => {
                                  const currentTab = prev[tab.id] || { visible: false, add: false, edit: false, delete: false };
                                  
                                  // If visibility is disabled, automatically disable everything else
                                  if (field === 'visible' && !val) {
                                    return {
                                      ...prev,
                                      [tab.id]: { visible: false, add: false, edit: false, delete: false }
                                    };
                                  }
                                  
                                  // If enabling write/edit/delete, automatically make visible
                                  const nextState = { ...currentTab, [field]: val };
                                  if ((field === 'add' || field === 'edit' || field === 'delete') && val) {
                                    nextState.visible = true;
                                  }
                                  
                                  return {
                                    ...prev,
                                    [tab.id]: nextState
                                  };
                                });
                              };

                              return (
                                <div key={tab.id} className="relative">
                                  {/* Tab Button Card */}
                                  <button
                                    type="button"
                                    onClick={() => setActivePopover(activePopover === tab.id ? null : tab.id)}
                                    className={`w-full p-3 rounded-2xl flex items-center gap-3 border text-xs font-semibold transition-all duration-200 cursor-pointer ${
                                      isTabActive
                                        ? 'border-2 border-brand bg-brand/5 dark:bg-brand/10 text-brand dark:text-emerald-400 shadow-sm'
                                        : 'border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900 text-slate-400 hover:border-slate-350 dark:hover:border-slate-700'
                                    }`}
                                  >
                                    <div className={`p-2 rounded-xl flex items-center justify-center ${
                                      isTabActive ? 'bg-brand text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-850 text-slate-400'
                                    }`}>
                                      <TabIconComponent className="w-5.5 h-5.5" />
                                    </div>
                                    <div className="flex flex-col text-left">
                                      <span className={isTabActive ? 'text-slate-800 dark:text-white font-bold' : ''}>
                                        {tab.label}
                                      </span>
                                      <span className="text-5xs text-slate-400 dark:text-slate-500 font-medium">
                                        {isTabActive ? 'Configurer les droits' : 'Aucun droit'}
                                      </span>
                                    </div>
                                  </button>

                                  {/* Floating Action Popover Overlay */}
                                  {activePopover === tab.id && (
                                    <>
                                      {/* Invisible background click-away helper */}
                                      <div className="fixed inset-0 z-49" onClick={() => setActivePopover(null)} />
                                      
                                      <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 rounded-2xl shadow-xl z-50 flex items-center gap-2 animate-slide-up">
                                        {/* Action: VOIR */}
                                        <button
                                          type="button"
                                          title="Droit de Voir"
                                          onClick={() => updatePerm('visible', !p.visible)}
                                          className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
                                            p.visible
                                              ? 'bg-brand border-brand text-white shadow-sm'
                                              : 'bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-400 hover:bg-slate-100'
                                          }`}
                                        >
                                          <Eye className="w-4.5 h-4.5" />
                                        </button>

                                        {/* Action: AJOUTER */}
                                        <button
                                          type="button"
                                          title="Droit d'Ajouter"
                                          onClick={() => updatePerm('add', !p.add)}
                                          className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
                                            p.add
                                              ? 'bg-brand border-brand text-white shadow-sm'
                                              : 'bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed'
                                          }`}
                                        >
                                          <Plus className="w-4.5 h-4.5" />
                                        </button>

                                        {/* Action: MODIFIER */}
                                        <button
                                          type="button"
                                          title="Droit de Modifier"
                                          onClick={() => updatePerm('edit', !p.edit)}
                                          className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
                                            p.edit
                                              ? 'bg-brand border-brand text-white shadow-sm'
                                              : 'bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed'
                                          }`}
                                        >
                                          <Edit2 className="w-4.5 h-4.5" />
                                        </button>

                                        {/* Action: SUPPRIMER */}
                                        <button
                                          type="button"
                                          title="Droit de Supprimer"
                                          onClick={() => updatePerm('delete', !p.delete)}
                                          className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
                                            p.delete
                                              ? 'bg-brand border-brand text-white shadow-sm'
                                              : 'bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed'
                                          }`}
                                        >
                                          <Trash2 className="w-4.5 h-4.5" />
                                        </button>

                                        <div className="w-px h-6 bg-slate-250 dark:bg-slate-800" />

                                        {/* Done Checkmark Button */}
                                        <button
                                          type="button"
                                          onClick={() => setActivePopover(null)}
                                          className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-all"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="form-label">Mot de passe pour connexion hors ligne (Optionnel)</label>
                <div className="relative rounded-xl shadow-sm">
                  <Key className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={formPassword}
                    onChange={e => setFormPassword(e.target.value)}
                    className="form-input pl-10 font-mono"
                    placeholder="Saisir pour réinitialiser le token hors-ligne"
                  />
                </div>
                <p className="text-4xs text-slate-400 mt-1">
                  Requis pour valider le hachage SHA-256 local et permettre la connexion en cas de coupure internet.
                </p>
              </div>

              <div className="flex gap-3 justify-end border-t border-slate-100 dark:border-slate-800/80 pt-4 mt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Annuler</button>
                <button type="submit" className="btn-primary"><Save className="w-4 h-4" /> Sauvegarder</button>
              </div>

            </form>
      </Modal>

    </div>
  );
};
