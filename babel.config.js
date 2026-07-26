module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Required by react-native-vision-camera v4 frame processors.
      // Must appear BEFORE reanimated/plugin (reanimated must be last).
      ['react-native-worklets-core/plugin', {
        globals: ['__camera'],
      }],
      'react-native-reanimated/plugin',
    ],
  };
};
