import React, { useRef, useCallback, createContext, useContext } from 'react';
import { View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

const RECAPTCHA_SITE_KEY = process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY ?? '';

// Runtime audit: log key fingerprint (first 10 chars) to verify correct key is loaded
if (RECAPTCHA_SITE_KEY) {
  console.log('[Recaptcha] Site Key Fingerprint:', RECAPTCHA_SITE_KEY.substring(0, 10) + '...');
  console.log('[Recaptcha] Site Key Length:', RECAPTCHA_SITE_KEY.length);
  // reCAPTCHA v3 keys are 40 chars. v2 checkbox/invisible keys can also be 40.
  // Enterprise keys have a different format. Warn if length looks wrong.
  if (RECAPTCHA_SITE_KEY.length !== 40) {
    console.warn('[Recaptcha] WARNING: Site key length is', RECAPTCHA_SITE_KEY.length, '- expected 40 for standard reCAPTCHA v3/v2 keys. Verify this is NOT an Enterprise key and is registered as v3 in the Google Admin Console.');
  }
} else {
  console.error('[Recaptcha] CRITICAL: EXPO_PUBLIC_RECAPTCHA_SITE_KEY is empty or undefined');
}

const RECAPTCHA_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}"></script>
  <style>body { margin: 0; padding: 0; background: transparent; }</style>
</head>
<body>
  <script>
    function sendLog(msg) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: msg }));
    }
    sendLog('WebView loaded. Site key inside WebView: ' + '${RECAPTCHA_SITE_KEY}'.substring(0, 10) + '...');
    sendLog('window.location.href: ' + (typeof window !== 'undefined' ? window.location.href : 'N/A'));
    sendLog('window.location.origin: ' + (typeof window !== 'undefined' ? window.location.origin : 'N/A'));
    sendLog('document.domain: ' + (typeof document !== 'undefined' ? document.domain : 'N/A'));
    function executeRecaptcha(action) {
      sendLog('executeRecaptcha called with action: ' + action);
      try {
        if (typeof grecaptcha === 'undefined') {
          sendLog('grecaptcha is UNDEFINED');
          window.ReactNativeWebView.postMessage(JSON.stringify({ error: 'reCAPTCHA script not loaded. Check site key and network.' }));
          return;
        }
        sendLog('grecaptcha is AVAILABLE');
        grecaptcha.ready(function() {
          sendLog('grecaptcha.ready fired');
          grecaptcha.execute('${RECAPTCHA_SITE_KEY}', { action: action })
            .then(function(token) {
              sendLog('postMessage TOKEN about to send');
              window.ReactNativeWebView.postMessage(JSON.stringify({ token: token, action: action }));
            })
            .catch(function(err) {
              sendLog('grecaptcha.execute CATCH: ' + (err.message || 'unknown'));
              window.ReactNativeWebView.postMessage(JSON.stringify({ error: err.message || 'reCAPTCHA execution failed' }));
            });
        });
      } catch(e) {
        sendLog('executeRecaptcha TOP-LEVEL CATCH: ' + (e.message || 'unknown'));
        window.ReactNativeWebView.postMessage(JSON.stringify({ error: e.message || 'reCAPTCHA internal error' }));
      }
    }
  </script>
</body>
</html>
`;

export type RecaptchaAction = 'login' | 'register' | 'booking_create' | 'message_send';

interface RecaptchaContextValue {
  execute: (action: RecaptchaAction) => Promise<string>;
}

const RecaptchaContext = createContext<RecaptchaContextValue | null>(null);

export function useRecaptcha(): RecaptchaContextValue {
  const ctx = useContext(RecaptchaContext);
  if (!ctx) {
    throw new Error('useRecaptcha must be used within a RecaptchaProvider');
  }
  return ctx;
}

interface PromiseRefs {
  resolve: (token: string) => void;
  reject: (err: Error) => void;
}

export function RecaptchaProvider({ children }: { children: React.ReactNode }) {
  const webViewRef = useRef<WebView>(null);
  const promiseRef = useRef<PromiseRefs | null>(null);

  const execute = useCallback((action: RecaptchaAction): Promise<string> => {
    console.log('[Recaptcha] execute called for action:', action);
    return new Promise((resolve, reject) => {
      if (!RECAPTCHA_SITE_KEY) {
        reject(new Error('EXPO_PUBLIC_RECAPTCHA_SITE_KEY is not configured'));
        return;
      }
      if (!webViewRef.current) {
        reject(new Error('reCAPTCHA WebView is not ready. Please try again.'));
        return;
      }
      const timeoutId = setTimeout(() => {
        if (promiseRef.current) {
          promiseRef.current = null;
          reject(new Error('reCAPTCHA timed out. Please check your connection and try again.'));
        }
      }, 10000);
      promiseRef.current = {
        resolve: (token: string) => { clearTimeout(timeoutId); resolve(token); },
        reject: (err: Error) => { clearTimeout(timeoutId); reject(err); },
      };
      const js = `executeRecaptcha('${action}'); true;`;
      console.log('[Recaptcha] injecting JS:', js);
      webViewRef.current.injectJavaScript(js);
    });
  }, []);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    console.log('[Recaptcha] onMessage raw data:', event.nativeEvent.data);
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'log') {
        console.log('[Recaptcha WebView]', data.message);
        return;
      }
      const { resolve, reject } = promiseRef.current ?? {};
      if (data.error) {
        reject?.(new Error(data.error));
      } else if (data.token) {
        resolve?.(data.token);
      } else {
        reject?.(new Error('Unexpected reCAPTCHA response'));
      }
    } catch {
      promiseRef.current?.reject(new Error('Failed to parse reCAPTCHA response'));
    } finally {
      if (!event.nativeEvent.data.includes('"type":"log"')) {
        promiseRef.current = null;
      }
    }
  }, []);

  return (
    <RecaptchaContext.Provider value={{ execute }}>
      {children}
      <View style={{ height: 1, width: 1, opacity: 0, position: 'absolute' }}>
        <WebView
          ref={webViewRef}
          source={{ html: RECAPTCHA_HTML }}
          onLoadStart={() => console.log('[Recaptcha] WebView onLoadStart')}
          onLoad={() => console.log('[Recaptcha] WebView onLoad')}
          onError={(e) => console.error('[Recaptcha] WebView onError:', e.nativeEvent)}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
          mixedContentMode="always"
          style={{ backgroundColor: 'transparent' }}
        />
      </View>
    </RecaptchaContext.Provider>
  );
}
