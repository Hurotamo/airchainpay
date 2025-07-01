const axios = require('axios');

// Replace with your actual signed transaction string
const signedTx = '0xYOUR_SIGNED_TX_HERE';

async function testRelay() {
  try {
    const res = await axios.post('http://localhost:4000/tx', { signedTx });
    console.log('Relay response:', res.data);
  } catch (err) {
    console.error('Relay error:', err.response ? err.response.data : err.message);
  }
}

testRelay(); 