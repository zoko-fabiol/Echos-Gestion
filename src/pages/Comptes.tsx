import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, UserAccount } from '../db/database';
import { useAuth, hashString } from '../context/AuthContext';
import { 
  ShieldAlert, UserCheck, UserX, Plus, Edit2, 
  Trash2, Save, X, Key, Mail, Shield 
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
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">Permissions d'accès aux onglets</h4>
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="p-3">Onglet</th>
                            <th className="p-3 text-center">Voir</th>
                            <th className="p-3 text-center">Ajouter</th>
                            <th className="p-3 text-center">Modifier</th>
                            <th className="p-3 text-center">Supprimer</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150 dark:divide-slate-800">
                          {[
                            {
                              title: 'Ressources Humaines',
                              tabs: [
                                { id: 'dashboard', label: 'RH Tableau de bord' },
                                { id: 'employes', label: 'Effectifs' },
                                { id: 'pointage', label: 'Présences / Pointage' },
                                { id: 'salaires', label: 'Calcul des Salaires' }
                              ]
                            },
                            {
                              title: 'Stock & Ventes',
                              tabs: [
                                { id: 'catalogue', label: 'Catalogue' },
                                { id: 'caisse', label: 'Caisse / POS' },
                                { id: 'stock', label: 'Inventaire' },
                                { id: 'transactions', label: 'Transactions & Dépenses' },
                                { id: 'production', label: 'Suivi de Production' }
                              ]
                            },
                            {
                              title: 'Administration',
                              tabs: [
                                { id: 'comptes', label: 'Utilisateurs' },
                                { id: 'settings', label: 'Paramètres' }
                              ]
                            }
                          ].map(sect => (
                            <React.Fragment key={sect.title}>
                              {/* Section Header Row */}
                              <tr className="bg-slate-50/70 dark:bg-slate-900/35 border-y border-slate-200/60 dark:border-slate-800/60">
                                <td colSpan={5} className="px-3 py-1.5 font-extrabold text-brand dark:text-emerald-400 text-3xs uppercase tracking-wider">
                                  {sect.title}
                                </td>
                              </tr>
                              
                              {sect.tabs.map(tab => {
                                const p = tabPermissions[tab.id] || { visible: false, add: false, edit: false, delete: false };
                                
                                const updatePerm = (field: 'visible' | 'add' | 'edit' | 'delete', val: boolean) => {
                                  setTabPermissions(prev => ({
                                    ...prev,
                                    [tab.id]: {
                                      ...prev[tab.id],
                                      [field]: val
                                    }
                                  }));
                                };

                                return (
                                  <tr key={tab.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-850/20">
                                    <td className="p-3 pl-5 font-semibold text-slate-700 dark:text-slate-300">{tab.label}</td>
                                    <td className="p-3 text-center">
                                      <input 
                                        type="checkbox" 
                                        checked={p.visible} 
                                        onChange={e => updatePerm('visible', e.target.checked)}
                                        className="w-4 h-4 rounded border-slate-350 dark:border-slate-700 text-brand focus:ring-brand accent-brand cursor-pointer transition-all"
                                      />
                                    </td>
                                    <td className="p-3 text-center">
                                      <input 
                                        type="checkbox" 
                                        checked={p.add} 
                                        disabled={!p.visible}
                                        onChange={e => updatePerm('add', e.target.checked)}
                                        className="w-4 h-4 rounded border-slate-350 dark:border-slate-700 text-brand focus:ring-brand accent-brand cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                      />
                                    </td>
                                    <td className="p-3 text-center">
                                      <input 
                                        type="checkbox" 
                                        checked={p.edit} 
                                        disabled={!p.visible}
                                        onChange={e => updatePerm('edit', e.target.checked)}
                                        className="w-4 h-4 rounded border-slate-350 dark:border-slate-700 text-brand focus:ring-brand accent-brand cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                      />
                                    </td>
                                    <td className="p-3 text-center">
                                      <input 
                                        type="checkbox" 
                                        checked={p.delete} 
                                        disabled={!p.visible}
                                        onChange={e => updatePerm('delete', e.target.checked)}
                                        className="w-4 h-4 rounded border-slate-350 dark:border-slate-700 text-brand focus:ring-brand accent-brand cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
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
