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

// `disableHierarchicalLookup` is deliberately NOT set. The Next app above us has
// its own node_modules with react 19.2.8, which makes expo-doctor report a
// duplicate react (19.2.3 here, 19.2.8 at ../node_modules). It is a false alarm
// in this layout: Metro resolves from this project's node_modules first, react
// is present there, so the parent's copy is never reached. Confirmed by
// exporting the iOS bundle and counting React's internals marker -- it appears
// once, not twice, so there is exactly one React in the output.
//
// The documented fix for a genuine duplicate is npm workspaces, which Expo's
// monorepo guide assumes. Turning this repo into a workspace would change how
// the deployed Next.js app resolves its dependencies, so it is not a change to
// make from inside a mobile feature.
config.resolver.nodeModulesPaths = [path.join(projectRoot, 'node_modules')];

// Metro refuses to look outside the project root unless told to, so the shared
// cart module needs both of these.
config.watchFolders = [sharedLib];
config.resolver.extraNodeModules = {
  '@shared': sharedLib,
};

module.exports = config;
