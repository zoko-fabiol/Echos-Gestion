import { collection, doc, getDoc, getDocs, setDoc, writeBatch, limit, query, orderBy, onSnapshot } from 'firebase/firestore';
import { firestore, auth } from '../config/firebase';
import { db } from '../db/database';
import { CompanyInfo, COMPANY_KEY, LOGO_KEY, THEME_COLOR_KEY, THEME_KEY, ODOO_BRIDGE_KEY } from '../config/constants';

type Unsubscribe = () => void;

const COLLECTIONS = [
  'inventory',
  'dailyRecords',
  'expenses',
  'clients',
  'suppliers',
  'quotes',
  'income',
  'productions',
  'rawMaterials',
  'rhAppData',
  'userAccounts',
  'appSettings',
  'actionLogs'
];

let realtimeUnsubs: Unsubscribe[] = [];
let realtimeTimer: NodeJS.Timeout | null = null;
let isPushingLocalData = false;
let isApplyingRemoteData = false;

export function getObjectHash(obj: any): string {
  if (!obj) return '';
  const { updatedAt, updatedBy, deviceId, ...cleanObj } = obj;
  const str = JSON.stringify(cleanObj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

// --- DEVICE ID HELPER ---

export function getDeviceId(): string {
  const existing = localStorage.getItem('stock_expert_device_id');
  if (existing) return existing;
  const id = `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem('stock_expert_device_id', id);
  return id;
}

// --- CONVERT ARRAY TO CHUNKS FOR BATCH ---

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// --- SYNC UP: PUSH DEXIE TO FIRESTORE ---

export async function syncUp(): Promise<{ ok: boolean; timestamp: number } | null> {
  if (isApplyingRemoteData) return null;
  isPushingLocalData = true;

  try {
    const currentUid = auth.currentUser?.uid || 'local-device';
    const deviceId = getDeviceId();
    const now = Date.now();

    // 1. Gather all local state from Dexie
    const state: Record<string, any[]> = {};
    
    state.inventory = await db.inventory.toArray();
    state.dailyRecords = await db.dailyRecords.toArray();
    state.expenses = await db.expenses.toArray();
    state.clients = await db.clients.toArray();
    state.suppliers = await db.suppliers.toArray();
    state.quotes = await db.quotes.toArray();
    state.income = await db.income.toArray();
    state.productions = await db.productions.toArray();
    state.rawMaterials = await db.rawMaterials.toArray();
    state.userAccounts = await db.userAccounts.toArray();

    // 2. appSettings specific push
    const appSettingsArray = await db.appSettings.toArray();
    const settingsObj: Record<string, any> = {
      updatedAt: now,
      deviceId
    };
    appSettingsArray.forEach(s => {
      if (s.key === LOGO_KEY) settingsObj.logoUrl = s.value;
      if (s.key === THEME_COLOR_KEY) settingsObj.themeColor = s.value;
      if (s.key === THEME_KEY) settingsObj.theme = s.value;
      if (s.key === COMPANY_KEY) {
        const info = s.value as CompanyInfo;
        settingsObj.companyName = info.name || '';
        settingsObj.companyContact = info.contact || '';
        settingsObj.companyFooter = info.footer || '';
      }
    });
    await setDoc(doc(firestore, 'appSettings', 'settings'), settingsObj, { merge: true });

    // 3. rhAppData specific push
    const rhAppDataRow = await db.rhAppData.get('rh_app_data');
    if (rhAppDataRow) {
      const currentHash = getObjectHash(rhAppDataRow.value);
      const cachedHash = localStorage.getItem('synchash_rhAppData_current');
      if (currentHash !== cachedHash) {
        await setDoc(doc(firestore, 'rhAppData', 'current'), {
          payload: JSON.stringify(rhAppDataRow.value),
          updatedAt: now,
          updatedBy: currentUid,
          deviceId
        }, { merge: true });
        localStorage.setItem('synchash_rhAppData_current', currentHash);
      }
    }

    // 4. Batch push regular tables (limit 350 items per batch)
    for (const collName of Object.keys(state)) {
      const items = state[collName];
      if (collName === 'userAccounts') {
        // Sync user accounts with remote
        for (const user of items) {
          const userDocRef = doc(firestore, 'userAccounts', user.uid);
          // Strip out local-only parameters like hashedToken to avoid leak in firestore
          const syncUser = { ...user };
          delete syncUser.hashedToken;
          delete syncUser.lastEmailVerificationCheck;

          const currentHash = getObjectHash(syncUser);
          const cachedHash = localStorage.getItem(`synchash_userAccounts_${user.uid}`);
          if (currentHash === cachedHash) continue;

          await setDoc(userDocRef, {
            ...syncUser,
            updatedAt: now,
            updatedBy: currentUid,
            deviceId
          }, { merge: true });

          localStorage.setItem(`synchash_userAccounts_${user.uid}`, currentHash);
        }
        continue;
      }

      const chunks = chunkArray(items, 350);
      for (const chunk of chunks) {
        const batch = writeBatch(firestore);
        let batchCount = 0;
        
        chunk.forEach(item => {
          const docId = String(item.id);
          const currentHash = getObjectHash(item);
          const cachedHash = localStorage.getItem(`synchash_${collName}_${docId}`);
          
          if (currentHash === cachedHash) {
            return;
          }
          
          const docRef = doc(firestore, collName, docId);
          batch.set(docRef, {
            ...item,
            updatedAt: now,
            updatedBy: currentUid,
            deviceId
          }, { merge: true });
          batchCount++;
        });
        
        if (batchCount > 0) {
          await batch.commit();
          chunk.forEach(item => {
            const docId = String(item.id);
            const currentHash = getObjectHash(item);
            localStorage.setItem(`synchash_${collName}_${docId}`, currentHash);
          });
        }
      }
    }

    console.info('[SyncEngine] Pushed state to Firestore successfully.');
    return { ok: true, timestamp: now };
  } catch (err) {
    console.error('[SyncEngine] syncUp failed:', err);
    throw err;
  } finally {
    isPushingLocalData = false;
  }
}

// --- SYNC DOWN: PULL FIRESTORE TO DEXIE ---

export async function syncDown(): Promise<void> {
  if (isPushingLocalData) return;
  isApplyingRemoteData = true;

  try {
    console.info('[SyncEngine] Pulling state from Firestore...');
    const now = Date.now();

    // 1. Pull appSettings
    const settingsSnap = await getDoc(doc(firestore, 'appSettings', 'settings'));
    if (settingsSnap.exists()) {
      const s = settingsSnap.data();
      if (s.logoUrl) await db.appSettings.put({ key: LOGO_KEY, value: s.logoUrl, timestamp: now });
      if (s.themeColor) await db.appSettings.put({ key: THEME_COLOR_KEY, value: s.themeColor, timestamp: now });
      if (s.theme) await db.appSettings.put({ key: THEME_KEY, value: s.theme, timestamp: now });
      if (s.companyName || s.companyContact || s.companyFooter) {
        const info: CompanyInfo = {
          name: s.companyName || '',
          contact: s.companyContact || '',
          footer: s.companyFooter || ''
        };
        await db.appSettings.put({ key: COMPANY_KEY, value: info, timestamp: now });
      }
    }

    // 2. Pull rhAppData
    const rhSnap = await getDoc(doc(firestore, 'rhAppData', 'current'));
    if (rhSnap.exists()) {
      const r = rhSnap.data();
      if (r.payload) {
        try {
          const parsed = JSON.parse(r.payload);
          await db.rhAppData.put({ key: 'rh_app_data', value: parsed });
          localStorage.setItem('synchash_rhAppData_current', getObjectHash(parsed));
        } catch (e) {
          console.warn('[SyncEngine] Failed to parse remote rhAppData payload', e);
        }
      }
    }

    // 3. Pull other regular collections
    const collectionsToPull = [
      'inventory',
      'dailyRecords',
      'expenses',
      'clients',
      'suppliers',
      'quotes',
      'income',
      'productions',
      'rawMaterials'
    ];

    for (const collName of collectionsToPull) {
      const snap = await getDocs(collection(firestore, collName));
      const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

      items.forEach((item: any) => {
        const docId = String(item.id);
        const currentHash = getObjectHash(item);
        localStorage.setItem(`synchash_${collName}_${docId}`, currentHash);
      });

      if (collName === 'inventory') {
        const castItems = items.map((i: any) => ({ ...i, id: Number(i.id) } as any));
        await db.inventory.clear();
        if (castItems.length > 0) await db.inventory.bulkPut(castItems);
      } else if (collName === 'dailyRecords') {
        const castItems = items.map((i: any) => ({ ...i, id: Number(i.id) } as any));
        await db.dailyRecords.clear();
        if (castItems.length > 0) await db.dailyRecords.bulkPut(castItems);
      } else if (collName === 'expenses') {
        const castItems = items.map((i: any) => ({ ...i, id: Number(i.id) } as any));
        await db.expenses.clear();
        if (castItems.length > 0) await db.expenses.bulkPut(castItems);
      } else if (collName === 'clients') {
        await db.clients.clear();
        if (items.length > 0) await db.clients.bulkPut(items as any);
      } else if (collName === 'suppliers') {
        await db.suppliers.clear();
        if (items.length > 0) await db.suppliers.bulkPut(items as any);
      } else if (collName === 'quotes') {
        const castItems = items.map((i: any) => ({ ...i, id: Number(i.id) } as any));
        await db.quotes.clear();
        if (castItems.length > 0) await db.quotes.bulkPut(castItems);
      } else if (collName === 'income') {
        const castItems = items.map((i: any) => ({ ...i, id: Number(i.id) } as any));
        await db.income.clear();
        if (castItems.length > 0) await db.income.bulkPut(castItems);
      } else if (collName === 'productions') {
        const castItems = items.map((i: any) => ({ ...i, id: Number(i.id) } as any));
        await db.productions.clear();
        if (castItems.length > 0) await db.productions.bulkPut(castItems);
      } else if (collName === 'rawMaterials') {
        const castItems = items.map((i: any) => ({ ...i, id: Number(i.id) } as any));
        await db.rawMaterials.clear();
        if (castItems.length > 0) await db.rawMaterials.bulkPut(castItems);
      }
    }

    // 4. Pull userAccounts, keeping local tokens intact
    const usersSnap = await getDocs(collection(firestore, 'userAccounts'));
    const remoteUsers = usersSnap.docs.map((d: any) => ({ uid: d.id, ...d.data() } as any));

    const existingUsers = await db.userAccounts.toArray();
    const localTokens: Record<string, string> = {};
    const localChecks: Record<string, number> = {};
    existingUsers.forEach(u => {
      if (u.hashedToken) localTokens[u.uid] = u.hashedToken;
      if (u.lastEmailVerificationCheck) localChecks[u.uid] = u.lastEmailVerificationCheck;
    });

    remoteUsers.forEach((u: any) => {
      if (localTokens[u.uid]) u.hashedToken = localTokens[u.uid];
      if (localChecks[u.uid]) u.lastEmailVerificationCheck = localChecks[u.uid];
      
      const docId = String(u.uid);
      const currentHash = getObjectHash(u);
      localStorage.setItem(`synchash_userAccounts_${docId}`, currentHash);
    });

    await db.userAccounts.clear();
    if (remoteUsers.length > 0) {
      await db.userAccounts.bulkPut(remoteUsers);
    }

    console.info('[SyncEngine] Pulled state from Firestore successfully.');
  } catch (err) {
    console.error('[SyncEngine] syncDown failed:', err);
    throw err;
  } finally {
    isApplyingRemoteData = false;
  }
}

// --- REAL-TIME SYNC MANAGEMENT ---

export function startRealtimeSync(onSyncCompleted?: () => void): void {
  stopRealtimeSync();

  COLLECTIONS.forEach(collName => {
    const unsubscribe = onSnapshot(collection(firestore, collName), (snapshot: any) => {
      // Ignore if local writes are pending
      if (snapshot.metadata.hasPendingWrites) return;

      // Avoid pull loop when pushing or applying
      if (!isPushingLocalData && !isApplyingRemoteData) {
        if (realtimeTimer) clearTimeout(realtimeTimer);
        
        realtimeTimer = setTimeout(async () => {
          realtimeTimer = null;
          try {
            await syncDown();
            if (onSyncCompleted) onSyncCompleted();
          } catch (e) {
            console.warn('[SyncEngine] Real-time pull refresh failed:', e);
          }
        }, 1000);
      }
    }, (err: any) => {
      console.warn(`[SyncEngine] Firestore subscription error for ${collName}:`, err);
    });
    realtimeUnsubs.push(unsubscribe);
  });

  console.info('[SyncEngine] Real-time listeners active.');
}

export function stopRealtimeSync(): void {
  realtimeUnsubs.forEach(unsub => unsub());
  realtimeUnsubs = [];
  if (realtimeTimer) {
    clearTimeout(realtimeTimer);
    realtimeTimer = null;
  }
  console.info('[SyncEngine] Real-time listeners stopped.');
}

// --- ODOO LOGS / STATUS HELPERS ---

export async function writeOdooSyncLog(entry: {
  kind: string;
  message: string;
  status: 'success' | 'error' | 'warning' | 'info';
  timestamp: number;
  source?: string;
}): Promise<{ ok: boolean; id: string }> {
  try {
    const docId = `odoo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      ...entry,
      id: docId,
      source: entry.source || 'odoo-bridge',
      createdAt: Date.now(),
      deviceId: getDeviceId()
    };
    await setDoc(doc(firestore, 'odooSyncLog', docId), payload);
    return { ok: true, id: docId };
  } catch (err) {
    console.error('[SyncEngine] Failed to write Odoo sync log:', err);
    throw err;
  }
}

export async function writeOdooBridgeStatus(status: {
  active: boolean;
  lastSync?: number;
  error?: string | null;
}): Promise<{ ok: boolean }> {
  try {
    const payload = {
      ...status,
      updatedAt: Date.now(),
      deviceId: getDeviceId()
    };
    await setDoc(doc(firestore, 'appSettings', ODOO_BRIDGE_KEY), payload, { merge: true });
    return { ok: true };
  } catch (err) {
    console.error('[SyncEngine] Failed to write Odoo bridge status:', err);
    throw err;
  }
}

export async function getLatestOdooSyncLog(): Promise<any | null> {
  // Queries aren't complex, we just fetch logs order by timestamp
  // We can fetch from firestore using query + limit
  try {
    const q = query(collection(firestore, 'odooSyncLog'), orderBy('timestamp', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].data();
  } catch (err) {
    console.error('[SyncEngine] Failed to fetch latest Odoo sync log:', err);
    return null;
  }
}
