import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Delete } from 'lucide-react';
import { showToast } from './ui/Toast';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { AppLogo } from './AppLogo';

export const PinLockModal: React.FC = () => {
  const { isAppLocked, unlockApp, logout } = useAuth();
  useLockBodyScroll(isAppLocked);

  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);


  // Focus tracking/input handler from physical keyboard
  useEffect(() => {
    if (!isAppLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        const num = e.key;
        setDigits(prev => {
          const next = [...prev];
          const emptyIdx = next.findIndex(d => d === '');
          if (emptyIdx !== -1) {
            next[emptyIdx] = num;
          }
          return next;
        });
      } else if (e.key === 'Backspace') {
        setDigits(prev => {
          const next = [...prev];
          const lastFilledIdx = next.map(d => d !== '').lastIndexOf(true);
          if (lastFilledIdx !== -1) {
            next[lastFilledIdx] = '';
          }
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAppLocked]);

  // Check PIN completion
  useEffect(() => {
    if (digits.every(d => d !== '')) {
      const verify = async () => {
        setLoading(true);
        const pin = digits.join('');
        const success = await unlockApp(pin);
        if (success) {
          showToast('Application déverrouillée !', 'success');
          setDigits(['', '', '', '']);
        } else {
          setShake(true);
          showToast('Code PIN incorrect.', 'error');
          setTimeout(() => {
            setShake(false);
            setDigits(['', '', '', '']);
          }, 600);
        }
        setLoading(false);
      };
      verify();
    }
  }, [digits, unlockApp]);

  if (!isAppLocked) return null;

  const handleKeyPress = (num: number) => {
    setDigits(prev => {
      const next = [...prev];
      const emptyIdx = next.findIndex(d => d === '');
      if (emptyIdx !== -1) {
        next[emptyIdx] = String(num);
      }
      return next;
    });
  };

  const handleDelete = () => {
    setDigits(prev => {
      const next = [...prev];
      const lastFilledIdx = next.map(d => d !== '').lastIndexOf(true);
      if (lastFilledIdx !== -1) {
        next[lastFilledIdx] = '';
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-lg z-[9999] flex flex-col items-center justify-center p-4">
      <div className={`w-full max-w-sm flex flex-col items-center text-center ${shake ? 'animate-shake' : ''}`}>
        
        {/* Logo */}
        <div className="mb-6">
          <AppLogo size={80} fallback={
            <div className="p-4 bg-brand/10 rounded-full border border-brand/20 text-brand animate-pulse">
              <Lock className="w-8 h-8" />
            </div>
          } />
        </div>

        <h1 className="text-2xl font-bold text-slate-100 mb-2">Session verrouillée</h1>
        <p className="text-slate-400 text-sm mb-8">Veuillez saisir votre code PIN à 4 chiffres</p>

        {/* PIN Indicators */}
        <div className="flex gap-4 mb-10">
          {digits.map((digit, idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                digit !== '' 
                  ? 'bg-brand border-brand scale-125' 
                  : 'bg-transparent border-slate-600'
              }`}
            />
          ))}
        </div>

        {/* Visual Keypad */}
        <div className="grid grid-cols-3 gap-4 w-full max-w-[280px] mb-8">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              onClick={() => handleKeyPress(num)}
              disabled={loading}
              className="w-16 h-16 rounded-full glass border border-slate-700/50 hover:bg-slate-800 text-slate-100 text-2xl font-semibold flex items-center justify-center transition-colors active:scale-95 duration-100"
            >
              {num}
            </button>
          ))}
          
          <button
            onClick={logout}
            disabled={loading}
            className="w-16 h-16 rounded-full text-red-400 hover:text-red-300 text-xs font-semibold flex items-center justify-center transition-colors active:scale-95"
          >
            Déconnexion
          </button>
          
          <button
            onClick={() => handleKeyPress(0)}
            disabled={loading}
            className="w-16 h-16 rounded-full glass border border-slate-700/50 hover:bg-slate-800 text-slate-100 text-2xl font-semibold flex items-center justify-center transition-colors active:scale-95"
          >
            0
          </button>
          
          <button
            onClick={handleDelete}
            disabled={loading}
            className="w-16 h-16 rounded-full text-slate-400 hover:text-slate-300 flex items-center justify-center transition-colors active:scale-95"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
