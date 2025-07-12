import 'react-native-get-random-values';

let secureRandom;

try {
  secureRandom = require('react-native-get-random-values');
  console.log('[SecureRandom] Successfully loaded react-native-get-random-values');
} catch (error) {
  console.warn('[SecureRandom] Failed to load react-native-get-random-values, using fallback:', error.message);
  secureRandom = {
    getRandomValues: function(buffer) {
      console.warn('[SecureRandom] Using fallback random number generator - not secure!');
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
      }
      return buffer;
    }
  };
}

export default secureRandom; 