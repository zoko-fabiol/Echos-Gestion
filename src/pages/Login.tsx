import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, ShieldAlert, AlertCircle } from 'lucide-react';
import { showToast } from '../components/ui/Toast';
import { AppLogo } from '../components/AppLogo';

export const Login: React.FC = () => {
  const { loginWithEmail, isOnline } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Veuillez remplir tous les champs.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await loginWithEmail(email, password);
    } catch (err: any) {
      console.error('[Login] Classical login error:', err);
      setError(err.message || 'Une erreur est survenue lors de la connexion.');
      showToast(err.message || 'Erreur de connexion', 'error');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      
      {/* Background gradients */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-brand/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-brand/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center z-10">
        <AppLogo size={64} fallback={
          <div className="inline-flex w-14 h-14 bg-brand rounded-2xl items-center justify-center text-white font-extrabold text-2xl shadow-xl shadow-brand/20 mb-4">
            E
          </div>
        } />
        <h2 className="text-3xl font-extrabold text-white tracking-tight">
          Echo Gestion
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Système unifié de Ressources Humaines & Stocks
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10 px-4">
        <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl py-8 px-6 sm:px-10 shadow-2xl shadow-black/40 animate-fade-scale">
          
          {/* Offline Warning banner */}
          {!isOnline && (
            <div className="mb-6 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-xs flex gap-2.5 items-start">
              <AlertCircle className="w-4.5 h-4.5 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Mode Hors Ligne Actif</span>. L'authentification utilisera les identifiants stockés localement sur cet appareil lors de votre dernière connexion.
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-600/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex gap-2.5 items-start">
              <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="font-medium">{error}</div>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="form-label text-slate-400">
                Adresse e-mail
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  disabled={loading}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="form-input pl-11 bg-slate-900/50 border-slate-800 focus:border-brand/80 text-white placeholder-slate-500"
                  placeholder="exemple@echosdechezmoi.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="form-label text-slate-400">
                Mot de passe
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  disabled={loading}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="form-input pl-11 bg-slate-900/50 border-slate-800 focus:border-brand/80 text-white placeholder-slate-500"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-3 hover:scale-[1.01] transition-transform text-base"
              >
                {loading ? 'Connexion en cours...' : 'Se connecter'}
              </button>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
};
