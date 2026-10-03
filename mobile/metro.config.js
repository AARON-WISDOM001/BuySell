const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;

// The cart rules — quantity ceiling, line ceiling, and the merge order used when
// a guest signs in — live in the Next app as src/lib/cart.ts so both platforms
// cannot drift apart. Metro refuses to look outside the project root unless it
// is told to, hence the alias. The module is pure TypeScript with no React or
// Next imports, which is what makes sharing it safe.
const sharedLib = path.resolve(projectRoot, '..', 'src', 'lib');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [sharedLib];
config.resolver.extraNodeModules = {
  '@shared': sharedLib,
};

module.exports = config;
