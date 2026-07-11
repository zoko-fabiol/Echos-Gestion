import React from 'react';
import { useAppLogo } from '../hooks/useAppLogo';

interface AppLogoProps {
  size?: number;        // taille en pixels (défaut: 36)
  fallback?: React.ReactNode;  // contenu si pas de logo
  className?: string;
}

/**
 * Composant logo d'entreprise — toujours circulaire via inline style.
 * Récupère automatiquement le logo configuré dans les paramètres.
 */
export const AppLogo: React.FC<AppLogoProps> = ({ 
  size = 36, 
  fallback,
  className = ''
}) => {
  const appLogo = useAppLogo();

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    borderRadius: '50%',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    border: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
    flexShrink: 0,
  };

  const imgStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    borderRadius: '50%',
    display: 'block',
  };

  if (appLogo) {
    return (
      <div style={containerStyle} className={className}>
        <img src={appLogo} alt="Logo" style={imgStyle} />
      </div>
    );
  }

  return <>{fallback}</> || null;
};
