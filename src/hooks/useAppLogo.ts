import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { LOGO_KEY } from '../config/constants';

/**
 * Retourne le logo de l'entreprise configuré dans les paramètres (base64).
 * Retourne null si aucun logo n'est configuré.
 */
export function useAppLogo(): string | null {
  const logoRecord = useLiveQuery(() => db.appSettings.get(LOGO_KEY));
  return logoRecord?.value || null;
}
