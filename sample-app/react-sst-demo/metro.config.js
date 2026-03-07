const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const cheqPkgRoot = path.resolve(workspaceRoot, 'source/cheq-sst-react');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot, cheqPkgRoot];

config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
];

// Key line: force the package name -> real path
config.resolver.extraNodeModules = {
    'cheq-sst-react': cheqPkgRoot,
};

// Make Metro follow workspace symlinks better
config.resolver.unstable_enableSymlinks = true;

module.exports = config;