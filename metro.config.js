const { withNativeWind } = require('nativewind/metro');
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// Adicionar extensões de assets
config.resolver.assetExts.push('lottie', 'json');

module.exports = withNativeWind(config, {
  input: './app/globals.css',
  configPath: './tailwind.config.js',
});