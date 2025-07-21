//! Transaction entity for the wallet core

use serde::{Serialize, Deserialize};
use rlp::{Encodable, RlpStream};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub to: String,
    pub value: String,
    pub data: Option<String>,
    pub gas_limit: Option<u64>,
    pub gas_price: Option<u64>,
    pub nonce: Option<u64>,
    pub chain_id: u64,
}

impl Encodable for Transaction {
    fn rlp_append(&self, s: &mut RlpStream) {
        // Ethereum transaction RLP order: nonce, gas_price, gas_limit, to, value, data, chain_id, 0, 0
        s.begin_list(9);
        s.append(&self.nonce.unwrap_or(0));
        s.append(&self.gas_price.unwrap_or(0));
        s.append(&self.gas_limit.unwrap_or(21000));
        s.append(&self.to);
        s.append(&self.value);
        s.append(&self.data.clone().unwrap_or_default());
        s.append(&self.chain_id);
        s.append(&0u8); // empty r
        s.append(&0u8); // empty s
    }
}

impl Transaction {
    /// RLP-encode the signed transaction for broadcast (EIP-155)
    pub fn rlp_signed(&self, r: &[u8], s: &[u8], v: u8) -> Vec<u8> {
        let mut s_rlp = RlpStream::new_list(9);
        s_rlp.append(&self.nonce.unwrap_or(0));
        s_rlp.append(&self.gas_price.unwrap_or(0));
        s_rlp.append(&self.gas_limit.unwrap_or(21000));
        s_rlp.append(&self.to);
        s_rlp.append(&self.value);
        s_rlp.append(&self.data.clone().unwrap_or_default());
        s_rlp.append(&v);
        s_rlp.append(&r);
        s_rlp.append(&s);
        s_rlp.out().to_vec()
    }
} 