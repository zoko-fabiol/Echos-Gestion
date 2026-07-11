import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Mail, RefreshCw, X } from 'lucide-react';
import { showToast } from './ui/Toast';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

export const PinVerifyModal: React.FC = () => {
  const { emailVerificationRequired, verifyEmailPin, resendEmailPin, logout, currentUser } = useAuth();
  useLockBodyScroll(emailVerificationRequired);

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);

  const [cooldown, setCooldown] = useState(0);
  const [shake, setShake] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Cooldown timer for resend
  useEffect(() => {
    if (cooldown === 0) return;
    const interval = setInterval(() => {
      setCooldown(c => c - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // Trigger PIN verification when all digits are filled
  useEffect(() => {
    if (digits.every(d => d !== '')) {
      const verify = async () => {
        setLoading(true);
        const pinCode = digits.join('');
        const success = await verifyEmailPin(pinCode);
        if (success) {
          showToast('Code PIN vérifié avec succès !', 'success');
          setDigits(['', '', '', '', '', '']);
        } else {
          setShake(true);
          showToast('Code PIN incorrect ou expiré.', 'error');
          setTimeout(() => {
            setShake(false);
            setDigits(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
          }, 800);
        }
        setLoading(false);
      };
      verify();
    }
  }, [digits, verifyEmailPin]);

  if (!emailVerificationRequired) return null;

  const handleInput = (index: number, val: string) => {
    const clean = val.replace(/[^0-9]/g, '').slice(-1);
    setDigits(prev => {
      const next = [...prev];
      next[index] = clean;
      return next;
    });

    if (clean && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        setDigits(prev => {
          const next = [...prev];
          next[index - 1] = '';
          return next;
        });
        inputRefs.current[index - 1]?.focus();
      } else {
        setDigits(prev => {
          const next = [...prev];
          next[index] = '';
          return next;
        });
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    const nums = pasted.replace(/[^0-9]/g, '').slice(0, 6).split('');
    
    setDigits(prev => {
      const next = [...prev];
      for (let i = 0; i < 6; i++) {
        next[i] = nums[i] || '';
      }
      return next;
    });

    const focusIdx = Math.min(nums.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    try {
      await resendEmailPin();
      showToast('Un nouveau code de validation a été envoyé par e-mail.', 'success');
      setCooldown(60);
    } catch (e: any) {
      showToast(`Erreur d'envoi: ${e.message}`, 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
      <div className={`w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 shadow-2xl rounded-2xl p-6 md:p-8 animate-fade-scale ${shake ? 'animate-shake' : ''}`}>
        
        {/* Header icons */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-brand/10 text-brand rounded-xl border border-brand/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Double validation</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Vérification de sécurité requise</p>
            </div>
          </div>
          <button 
            onClick={logout}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info */}
        <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/50 flex gap-3 mb-6">
          <Mail className="w-5 h-5 text-brand flex-shrink-0 mt-0.5" />
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Un code à 6 chiffres a été envoyé à l'adresse <span className="font-semibold text-slate-800 dark:text-white">{currentUser?.email}</span>. 
            Veuillez le saisir ci-dessous.
          </div>
        </div>

        {/* Input Boxes */}
        <div className="flex justify-between gap-2 md:gap-3 mb-8" onPaste={handlePaste}>
          {digits.map((digit, idx) => (
            <input
              key={idx}
              ref={el => inputRefs.current[idx] = el}
              type="text"
              maxLength={1}
              value={digit}
              disabled={loading}
              onChange={e => handleInput(idx, e.target.value)}
              onKeyDown={e => handleKeyDown(idx, e)}
              className="w-12 h-14 text-center text-2xl font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-brand/40 focus:border-brand transition-all text-slate-800 dark:text-white"
            />
          ))}
        </div>

        {/* Resend button */}
        <div className="flex flex-col gap-4 text-center">
          <button
            onClick={handleResend}
            disabled={cooldown > 0 || loading}
            className={`text-sm font-semibold flex items-center justify-center gap-2 mx-auto ${
              cooldown > 0 
                ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed' 
                : 'text-brand hover:text-brand-dark transition-colors'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {cooldown > 0 ? `Renvoyer le code (${cooldown}s)` : "Renvoyer un code par e-mail"}
          </button>

          <p className="text-xs text-slate-400 mt-2">
            Code d'urgence de développement : <span className="font-semibold select-all text-slate-600 dark:text-slate-300">999999</span>
          </p>

          <button
            onClick={logout}
            className="w-full mt-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-semibold rounded-xl text-sm transition-colors"
          >
            Annuler & Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
};
