const axios = require('axios');

async function checkPayments() {
  try {
    const res = await axios.get('http://localhost:4000/contract/payments');
    console.log('Recent payments:', res.data.payments);
  } catch (err) {
    console.error('Error fetching payments:', err.response ? err.response.data : err.message);
  }
}

checkPayments(); 