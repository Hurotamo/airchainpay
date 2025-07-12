
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Add module resolver for problematic imports
      [
        'module-resolver',
        {
          alias: {
            // Use our shims for problematic modules
            'crypto': './src/shims/crypto.js',
            '@adraffy/ens-normalize': './src/shims/ens-normalize.js',
            '@noble/hashes/crypto': './src/shims/crypto.js'
          }
        }
      ]
    ]
  };
};
