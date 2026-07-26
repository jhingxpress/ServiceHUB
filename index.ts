import 'react-native-url-polyfill/auto';
import { registerRootComponent } from 'expo';

// Dev-only spike entry: set EXPO_PUBLIC_IDV_SPIKE=1 to bypass normal
// navigation and launch the isolated IDV Phase 2A spike screen directly.
// This keeps the spike completely separate from the production app flow.
const isSpike = process.env.EXPO_PUBLIC_IDV_SPIKE === '1';

if (isSpike) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const IdvSpikeScreen = require('./src/dev/idvSpike/IdvSpikeScreen').default;
  registerRootComponent(IdvSpikeScreen);
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const App = require('./App').default;
  registerRootComponent(App);
}
