import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

// Global helper to show toast from anywhere
export const showToast = (message: string, type: ToastType = 'success') => {
  const event = new CustomEvent('show-toast', {
    detail: { message, type }
  });
  window.dispatchEvent(event);
};

// Bind to window for compatibility with legacy sync engines or global scripts
if (typeof window !== 'undefined') {
  (window as any).showToast = showToast;
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleShowToast = (e: Event) => {
      const { message, type } = (e as CustomEvent).detail;
      const id = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      setToasts(prev => [...prev, { id, message, type }]);

      // Auto-remove after 3.5 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 3500);
    };

    window.addEventListener('show-toast', handleShowToast);
    return () => {
      window.removeEventListener('show-toast', handleShowToast);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case 'info': return <Info className="w-4 h-4 text-sky-600 dark:text-sky-400" />;
    }
  };

  const getBgColor = (type: ToastType) => {
    switch (type) {
      case 'success': return 'bg-white/95 border-emerald-500/20 dark:bg-slate-900/95 dark:border-emerald-500/10 text-emerald-800 dark:text-emerald-200';
      case 'error': return 'bg-white/95 border-rose-500/20 dark:bg-slate-900/95 dark:border-rose-500/10 text-rose-800 dark:text-rose-200';
      case 'warning': return 'bg-white/95 border-amber-500/20 dark:bg-slate-900/95 dark:border-amber-500/10 text-amber-800 dark:text-amber-200';
      case 'info': return 'bg-white/95 border-sky-500/20 dark:bg-slate-900/95 dark:border-sky-500/10 text-sky-800 dark:text-sky-200';
    }
  };

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center max-w-sm w-full pointer-events-none px-4">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-center gap-2.5 px-4 py-2 rounded-full border shadow-md backdrop-blur-md transition-all duration-300 pointer-events-auto ${getBgColor(toast.type)}`}
          role="alert"
        >
          <div className="flex-shrink-0">{getIcon(toast.type)}</div>
          <div className="text-[11px] font-bold tracking-wide whitespace-nowrap overflow-hidden text-ellipsis">
            {toast.message}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors ml-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
