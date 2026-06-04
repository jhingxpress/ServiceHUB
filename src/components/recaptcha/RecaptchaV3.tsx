import React, { useRef, useCallback, createContext, useContext } from 'react';
import { View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

const RECAPTCHA_SITE_KEY = process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY ?? '';

// reCAPTCHA site key is read from EXPO_PUBLIC_RECAPTCHA_SITE_KEY

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
    function executeRecaptcha(action) {
      try {
        if (typeof grecaptcha === 'undefined') {
          window.ReactNativeWebView.postMessage(JSON.stringify({ error: 'reCAPTCHA script not loaded. Check site key and network.' }));
          return;
        }
        grecaptcha.ready(function() {
          grecaptcha.execute('${RECAPTCHA_SITE_KEY}', { action: action })
            .then(function(token) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ token: token, action: action }));
            })
            .catch(function(err) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ error: err.message || 'reCAPTCHA execution failed' }));
            });
        });
      } catch(e) {
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
      webViewRef.current.injectJavaScript(js);
    });
  }, []);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
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
      promiseRef.current = null;
    }
  }, []);

  return (
    <RecaptchaContext.Provider value={{ execute }}>
      {children}
      <View style={{ height: 1, width: 1, opacity: 0, position: 'absolute' }}>
        <WebView
          ref={webViewRef}
          source={{ html: RECAPTCHA_HTML }}
          onError={(e) => console.error('[Recaptcha] WebView onError:', e.nativeEvent.description)}
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
