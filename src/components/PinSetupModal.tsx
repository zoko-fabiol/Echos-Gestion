import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, Key, Check } from 'lucide-react';
import { showToast } from './ui/Toast';

export const PinSetupModal: React.FC = () => {
  const { isLoggedIn, securitySettings, saveSecurityPin } = useAuth();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  // If not logged in, or already has a PIN configured, do not show setup modal
  if (!isLoggedIn || securitySettings.pinHash) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      showToast('Le code PIN doit comporter 4 chiffres.', 'error');
      return;
    }

    if (pin !== confirmPin) {
      showToast('Les codes PIN ne correspondent pas.', 'error');
      return;
    }

    setLoading(true);
    try {
      await saveSecurityPin(pin);
      showToast('Code PIN configuré avec succès !', 'success');
    } catch (err: any) {
      showToast('Erreur lors de la configuration du code PIN.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[9998] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 shadow-2xl rounded-2xl p-6 md:p-8 animate-fade-scale">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-brand/10 text-brand rounded-xl border border-brand/20">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Configuration du PIN</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Première connexion requise</p>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/50 flex gap-3 mb-6 text-sm text-slate-650 dark:text-slate-350">
          <ShieldAlert className="w-5 h-5 text-brand flex-shrink-0 mt-0.5" />
          <div>
            Pour sécuriser vos données locales, veuillez configurer un code PIN à 4 chiffres. Il vous sera demandé lors de chaque reconnexion.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="form-label">Code PIN (4 chiffres)</label>
            <input
              type="password"
              pattern="[0-9]*"
              inputMode="numeric"
              maxLength={4}
              required
              placeholder="••••"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/[^0-9]/g, ''))}
              className="form-input text-center tracking-widest font-bold text-lg"
            />
          </div>

          <div>
            <label className="form-label">Confirmer le code PIN</label>
            <input
              type="password"
              pattern="[0-9]*"
              inputMode="numeric"
              maxLength={4}
              required
              placeholder="••••"
              value={confirmPin}
              onChange={e => setConfirmPin(e.target.value.replace(/[^0-9]/g, ''))}
              className="form-input text-center tracking-widest font-bold text-lg"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-3 bg-brand hover:bg-brand/90 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            {loading ? 'Enregistrement...' : 'Enregistrer le code PIN'}
          </button>
        </form>
      </div>
    </div>
  );
};
