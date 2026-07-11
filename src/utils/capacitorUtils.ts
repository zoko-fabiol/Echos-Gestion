/**
 * src/utils/capacitorUtils.ts
 * Wrappers around Capacitor plugins that fall back gracefully on web.
 * All functions are safe to call on both web and native Android/iOS.
 */

// --- DETECT IF RUNNING ON CAPACITOR NATIVE ---
export const isNativeApp = (): boolean => {
  return typeof (window as any)?.Capacitor !== 'undefined' &&
    (window as any).Capacitor?.isNativePlatform?.() === true;
};

// --- FILE DOWNLOAD / EXPORT NATIVE ---
export const downloadFileNative = async (
  base64Data: string, 
  fileName: string,
  mode: 'download' | 'share' = 'download'
): Promise<'saved' | 'shared' | 'fallback_shared' | 'failed'> => {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');

    // Remove the prefix if present (e.g., data:application/pdf;base64, or data:application/vnd.openxmlformats...)
    const base64 = base64Data.includes('base64,') 
      ? base64Data.split('base64,')[1] 
      : base64Data;

    if (mode === 'download') {
      // Check/request storage permissions
      try {
        const permStatus = await Filesystem.checkPermissions();
        if (permStatus.publicStorage !== 'granted') {
          await Filesystem.requestPermissions();
        }
      } catch (permError) {
        console.warn('[Capacitor] Permission check/request bypassed or failed:', permError);
      }

      // Try 1: Write directly to the root of the public Documents folder
      try {
        await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Documents,
        });
        console.log('[Capacitor] File written to Documents:', fileName);
        return 'saved';
      } catch (err1) {
        console.warn('[Capacitor] Try 1 failed, trying subfolder:', err1);

        // Try 2: Write to the subfolder inside public Documents
        try {
          try {
            await Filesystem.mkdir({
              path: 'Echo Gestion',
              directory: Directory.Documents,
              recursive: true,
            });
          } catch (m1) {
            console.warn('[Capacitor] mkdir Documents/Echo Gestion failed:', m1);
          }

          await Filesystem.writeFile({
            path: `Echo Gestion/${fileName}`,
            data: base64,
            directory: Directory.Documents,
          });
          console.log('[Capacitor] File written to Documents/Echo Gestion:', fileName);
          return 'saved';
        } catch (err2) {
          console.warn('[Capacitor] Try 2 failed, trying root of External storage:', err2);

          // Try 3: Write directly to root of App-Specific External Storage
          try {
            await Filesystem.writeFile({
              path: fileName,
              data: base64,
              directory: Directory.External,
            });
            console.log('[Capacitor] File written to External storage:', fileName);
            return 'saved';
          } catch (err3) {
            console.error('[Capacitor] All download attempts failed, falling back to Share sheet:', err3);
            throw err3;
          }
        }
      }
    } else {
      // Save to cache directory + Native Share sheet
      const { Share } = await import('@capacitor/share');

      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Cache,
      });

      await Share.share({
        title: fileName,
        url: result.uri,
      });

      return 'shared';
    }
  } catch (error) {
    console.error('[Capacitor] File Native Action failed, trying fallback Share sheet:', error);
    
    // Fallback if direct download fails
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');

      const base64 = base64Data.includes('base64,') 
        ? base64Data.split('base64,')[1] 
        : base64Data;

      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Cache,
      });

      await Share.share({
        title: fileName,
        url: result.uri,
      });

      return mode === 'download' ? 'fallback_shared' : 'shared';
    } catch (fallbackError) {
      console.error('[Capacitor] File Native completely failed:', fallbackError);
      return 'failed';
    }
  }
};

// --- TEXT-TO-SPEECH NATIVE ---
export const speakNative = async (text: string): Promise<boolean> => {
  try {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    
    // Stop any ongoing speech first
    try {
      await TextToSpeech.stop();
    } catch {}

    await TextToSpeech.speak({
      text: text,
      lang: 'fr-FR',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      category: 'ambient',
    });
    return true;
  } catch (err) {
    console.warn('[TTS] Native speech synthesis failed:', err);
    return false;
  }
};

// --- STOP SPEECH NATIVE ---
export const stopSpeechNative = async (): Promise<void> => {
  try {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    await TextToSpeech.stop();
  } catch {}
};
