import { useState, useEffect } from 'react';
import { db } from '../db/database';
import { showToast } from '../components/ui/Toast';
import { backupToJSON } from '../services/backupService';

interface BackupSchedule {
  enabled: boolean;
  day: number; // 0 (Dimanche) à 6 (Samedi)
  time: string; // "HH:MM"
}

export function useBackupScheduler() {
  const [schedule, setSchedule] = useState<BackupSchedule>({
    enabled: false,
    day: 0,
    time: '18:00'
  });

  // Load scheduler config from settings
  useEffect(() => {
    const loadSchedule = async () => {
      const stored = await db.appSettings.get('backup_schedule');
      if (stored && stored.value) {
        setSchedule(stored.value);
      }
    };
    loadSchedule();
  }, []);

  useEffect(() => {
    if (!schedule.enabled) return;

    const checkInterval = setInterval(async () => {
      const now = new Date();
      const currentDay = now.getDay(); // 0-6
      
      // Parse scheduled time
      const [schedHours, schedMins] = schedule.time.split(':').map(Number);
      
      // Target scheduled date/time today
      const schedDate = new Date();
      schedDate.setHours(schedHours, schedMins, 0, 0);

      // Verify day matches
      if (currentDay === schedule.day) {
        const timeDiffMs = now.getTime() - schedDate.getTime();
        const oneHourMs = 60 * 60 * 1000;

        // Check if we are inside the 1-hour window after the scheduled time
        if (timeDiffMs >= 0 && timeDiffMs < oneHourMs) {
          const lastBackupKey = `last_scheduled_backup_${now.getFullYear()}_${now.getMonth()}_${now.getDate()}`;
          const alreadyDone = localStorage.getItem(lastBackupKey);

          if (!alreadyDone) {
            // Check if we are past 60 minutes or inside the window
            if (timeDiffMs > 10 * 60 * 1000) {
              // Defer automatically if past 10 minutes window silently
              try {
                await backupToJSON();
                localStorage.setItem(lastBackupKey, 'true');
                showToast('Sauvegarde automatique hebdomadaire réussie.', 'success');
              } catch (e) {
                console.error('Auto backup failed', e);
              }
            } else {
              // Interactive Toast with action button
              showToast('Rappel : pensez à sauvegarder votre application (RH).', 'warning');
            }
          }
        }
      }
    }, 60 * 1000); // Check every minute

    return () => clearInterval(checkInterval);
  }, [schedule]);
}
