const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// SDK 56's development env context collects every .env* file, but its
// transformer only parses standard dotenv filenames. Keep deployment overlays
// and examples out of that context while preserving normal dotenv loading.
const nonstandardEnvFiles = /[/\\]\.env(?!(?:\.(?:local|(?:development|production)(?:\.local)?))?$)[^/\\]*$/;
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList) ? defaultBlockList : defaultBlockList ? [defaultBlockList] : []),
  nonstandardEnvFiles,
];

module.exports = config;
