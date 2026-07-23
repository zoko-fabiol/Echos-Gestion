import { db } from '../db/database';
import { auth } from '../config/firebase';

/**
 * Enregistre une action utilisateur dans la table des logs et la synchronise.
 */
export async function logAction(
  action: 'create' | 'update' | 'delete' | 'login' | 'export' | 'auth_fail' | 'ai_command',
  tabId: string,
  details: string,
  targetId?: string | number
) {
  try {
    const user = auth.currentUser;
    // Si l'utilisateur est hors-ligne / session restaurée localement
    const cachedUserJson = localStorage.getItem('stock_expert_user_session');
    let email = 'systeme@echosdechezmoi.com';
    let name = 'Système';

    if (user) {
      email = user.email || email;
      name = user.displayName || name;
    } else if (cachedUserJson) {
      try {
        const cachedUser = JSON.parse(cachedUserJson);
        email = cachedUser.email || email;
        name = cachedUser.displayName || name;
      } catch (_) {}
    }

    const logEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      userEmail: email,
      userName: name,
      action,
      tabId,
      details,
      targetId: targetId !== undefined ? String(targetId) : undefined
    };

    await db.actionLogs.put(logEntry);
  } catch (err) {
    console.error('Erreur lors de l\'enregistrement du log d\'activité:', err);
  }
}
