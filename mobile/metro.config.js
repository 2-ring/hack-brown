const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');
const sharedRoot = path.resolve(monorepoRoot, 'shared');

const config = getDefaultConfig(projectRoot);

// Watch the shared package for changes (hot reload across packages)
config.watchFolders = [sharedRoot];

// Resolve node_modules from both mobile dir and monorepo root (for hoisted deps)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Map @dropcal/shared to the shared source directory
config.resolver.extraNodeModules = {
  '@dropcal/shared': sharedRoot,
};

// Ensure proper platform-specific module resolution
config.resolver.sourceExts = [...config.resolver.sourceExts, 'jsx', 'js', 'ts', 'tsx'];

module.exports = config;
