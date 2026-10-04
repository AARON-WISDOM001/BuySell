const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// The Next app one directory up has its own node_modules and its own lockfile.
// This project is nested inside it rather than being an npm workspace, so there
// are two react trees on disk. That used to make expo-doctor report a duplicate,
// and it used to be papered over here by pointing watchFolders/extraNodeModules
// at the web app's src/lib so the phone could import the web's cart rules.
//
// That arrangement broke EAS Build, which uploads only this directory, and it
// was the only reason the duplicate warning was still showing:
//
//   Failed to construct transformer: ENOENT: no such file or directory,
//   stat '<build-root>/src/lib'
//
// With the cross-root import gone, expo's automatic monorepo handling applies
// cleanly: 21/21 doctor checks pass, and the iOS bundle contains exactly one
// React (counted via its internals marker) rather than two. Nothing is needed
// here, so this file stays empty on purpose -- do not add cross-root resolution
// back without re-testing a build that only contains mobile/.
//
// The cart rules the phone used to share now live in src/lib/cart-rules.ts.
// src/lib/__tests__/cart-rules-parity.test.ts fails if the two copies disagree.
module.exports = getDefaultConfig(projectRoot);