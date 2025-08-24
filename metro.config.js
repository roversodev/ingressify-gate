const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Adicionar extensões de assets
config.resolver.assetExts.push('lottie', 'json');

module.exports = withNativeWind(config, {
  input: './app/globals.css',
  configPath: './tailwind.config.js',
});