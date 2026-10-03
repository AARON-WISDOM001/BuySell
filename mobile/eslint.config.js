// The phone app lints itself. See the note in ../../eslint.config.mjs: the web
// project's Next.js rules do not apply to React Native, and mobile is a separate
// project with its own toolchain and its own `npm run verify`.
const expoConfig = require('eslint-config-expo/flat.js');

module.exports = [...expoConfig];
