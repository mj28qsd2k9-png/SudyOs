// Metro precisa enxergar a raiz do monorepo para resolver @estudaai/shared,
// que mora fora da pasta do app e e instalado via workspaces.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projeto = __dirname;
const raiz = path.resolve(projeto, '../..');

const config = getDefaultConfig(projeto);
config.watchFolders = [raiz];
config.resolver.nodeModulesPaths = [
  path.resolve(projeto, 'node_modules'),
  path.resolve(raiz, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
