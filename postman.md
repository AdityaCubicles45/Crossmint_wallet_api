# Xade Wallet Service — Postman Testing Guide

This guide walks you through the full end-to-end flow using Postman:
- Wallet creation
- Generating an unsigned transaction
- Funding the delegated key
- Signing and submitting the transaction
- Verifying storage in Supabase

---

## 1. Create a Wallet

**POST** `http://localhost:3000/dev/wallet`

**Headers:**
- `Content-Type: application/json`

**Body (raw, JSON):**
```json
{
  "adminWalletAddress": "0xYourAdminWalletAddress"
}
```

**Response Example:**
```json
{
  "success": true,
  "wallet": {
    "address": "0x..."
  },
  "delegatedKey": {
    "address": "0x..."
  }
}
```
**Save:**
- `wallet.address` (your smart wallet address)
- `delegatedKey.address` (your delegated key address)

---

## 2. Generate an Unsigned Transaction (Li.Fi Swap Example)

**POST** `http://localhost:3000/dev/transaction/lifi`

**Headers:**
- `Content-Type: application/json`

**Body (raw, JSON):**
```json
{
  "fromToken": "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",   
  "toToken": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",    
  "amount": "1000000000000000000",                            
  "fromAddress": "0x<your_wallet_address>",                   
  "toAddress": "0x<your_wallet_address>",                     
  "fromChain": "137",
  "toChain": "137",
  "slippage": 0.5
}
```

**Response Example:**
```json
{
  "success": true,
  "unsignedTx": {
    "to": "0x...",
    "value": "0x0",
    "data": "0x...",
    "chainId": 137,
    "gasPrice": "0x...",
    "gasLimit": "0x...",
    "from": "0x..."
  },
  "quote": { ... }
}
```
**Save:**
- The entire `unsignedTx` object

---

## 3. Fund the Delegated Key

**Send some MATIC** to the delegated key address (from step 1) using MetaMask or a faucet (if on testnet).
- This is required for the transaction to succeed.

---

## 4. Sign and Submit the Transaction

**POST** `http://localhost:3000/dev/transaction/sign-and-submit`

**Headers:**
- `Content-Type: application/json`

**Body (raw, JSON):**
```json
{
  "walletAddress": "0x<your_wallet_address>",
  "unsignedTx": {
    // Paste the entire unsignedTx object from step 2 here
    // Make sure the "from" field matches the delegated key address!
  }
}
```

**Response Example:**
```json
{
  "success": true,
  "txHash": "0x...",
  "txResponse": { ... }
}
```
**Save:**
- The `txHash` value

---

## 5. Check Supabase for Transaction Record

- Go to your Supabase dashboard.
- Open the `transactions` table.
- You should see a new row with the transaction hash, wallet address, delegated key address, and all transaction details.

---

## 6. (Optional) View Transaction on Polygonscan

- Go to [https://polygonscan.com/](https://polygonscan.com/) (or the relevant explorer for your network).
- Paste the `txHash` to view the transaction status and details.

---

## Troubleshooting
- **insufficient funds**: Make sure the delegated key has enough MATIC.
- **Delegated key not found**: Use the correct wallet address (all lowercase).
- **transaction from address mismatch**: The `from` field in `unsignedTx` must match the delegated key address.

---

## Tips
- Use Postman's "Pretty" view for JSON.
- Save variables between requests using the "Tests" tab.
- You can chain requests for automation.

---

**Need help?**
Let me know if you want a ready-to-import Postman collection or hit any issues! 