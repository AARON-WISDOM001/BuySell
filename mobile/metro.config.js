const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

// Intentionally empty. There is nothing to configure for this project.
//
// Two things were tried here and both were wrong.
//
// 1. watchFolders + extraNodeModules pointing at the web app's ../src/lib, so the
//    phone could import the web's cart rules instead of copying them. This works
//    on this machine and it is why the cart rules moved to src/lib/cart-rules.ts:
//    EAS Build uploads only this directory, so on the build machine ../src/lib
//    does not exist and Metro aborts before bundling anything.
//
//      Failed to construct transformer: ENOENT: no such file or directory,
//      stat '<build-root>/src/lib'
//
//    Reproduced by rsyncing mobile/ alone into a scratch directory and bundling.
//
// 2. resolver.disableHierarchicalLookup, to stop Metro walking up into the web
//    app's node_modules. It is worse than the problem: the bundle fails to build
//    at all, and expo-doctor drops from 20/21 to 19/21.
//
// So expo-doctor still reports one duplicate dependency -- react 19.2.3 here and
// 19.2.8 in the Next app above us. It is a local-layout artifact only. The EAS
// build machine receives mobile/ and nothing else, so there is no second copy
// there to collide with, and the exported iOS bundle contains exactly one React,
// counted via its internals marker. Deduplicating for real means either removing
// react from the web app or converting the repository to npm workspaces, and the
// latter would change how the deployed Next.js app installs. Neither belongs in a
// mobile change.
//
// Keep react pinned to the version SDK 57 is built against. Checked with
// `npx expo-doctor` and `npx expo export --platform ios`.
module.exports = getDefaultConfig(projectRoot);