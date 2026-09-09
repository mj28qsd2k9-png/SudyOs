/**
 * Metro num monorepo.
 *
 * O app importa `@estudaai/shared`, que mora fora da pasta dele. Duas coisas
 * bastam para isso funcionar: vigiar a pasta do pacote (para recompilar quando
 * ele mudar) e saber onde procurar dependencias.
 *
 * O que NAO fazer: vigiar a raiz inteira. Ela contem o `node_modules` do
 * workspace, com dezenas de milhares de arquivos — no macOS, sem watchman, isso
 * estoura o limite de arquivos abertos e o Metro morre. Dependencia tambem nao
 * muda enquanto o app roda, entao vigiar nao serve para nada.
 *
 * Tambem nao mexemos em `disableHierarchicalLookup`: desligar a busca
 * hierarquica quebra pacotes que contam com ela, e `nodeModulesPaths` ja
 * resolve o caso do monorepo.
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projeto = __dirname;
const raiz = path.resolve(projeto, '../..');

const config = getDefaultConfig(projeto);

config.watchFolders = [path.resolve(raiz, 'packages/shared')];
config.resolver.nodeModulesPaths = [
  path.resolve(projeto, 'node_modules'),
  path.resolve(raiz, 'node_modules'),
];

module.exports = config;
