# Xade Wallet Service API Documentation

## Base URL
```
https://api.xade.com/v1  # Production
https://staging-api.xade.com/v1  # Staging
```

## Authentication
All endpoints require an API key to be passed in the header:
```
x-api-key: your_api_key
```

## API Endpoints

### 1. Create Wallet
Creates a new Crossmint wallet and generates a delegated key.

```http
POST /wallet
```

**Request Body:**
```json
{
    "adminWalletAddress": "0x..." // Optional, will use env var if not provided
}
```

**Response:**
```json
{
    "success": true,
    "wallet": {
        "address": "0x...",
        "type": "evm-smart-wallet"
    },
    "delegatedKey": {
        "address": "0x...",
        "type": "evm-keypair"
    }
}
```

### 2. Store Delegated Key
Stores a delegated key in AWS KMS and DynamoDB.

```http
POST /delegated-key
```

**Request Body:**
```json
{
    "delegatedKeyPrivateKey": "your_private_key",
    "delegatedKeyAddress": "0x..."
}
```

**Response:**
```json
{
    "success": true,
    "message": "Delegated key stored successfully",
    "delegatedKeyAddress": "0x..."
}
```

### 3. Get Delegated Key
Retrieves a stored delegated key.

```http
POST /keys
```

**Request Body:**
```json
{
    "action": "getDelegatedKey",
    "address": "0x..." // The delegated key address
}
```

**Response:**
```json
{
    "success": true,
    "delegatedKeyAddress": "0x...",
    "delegatedKeyPrivateKey": "decrypted_private_key"
}
```

### 4. Create Transaction
Creates a new transaction.

```http
POST /transaction/create
```

**Request Body:**
```json
{
    "walletAddress": "0x...",
    "to": "0x...",
    "value": "1000000000000000000", // Amount in wei
    "data": "0x..." // Optional transaction data
}
```

**Response:**
```json
{
    "success": true,
    "transaction": {
        "id": "tx_id",
        "status": "pending",
        "walletAddress": "0x...",
        "to": "0x...",
        "value": "1000000000000000000"
    }
}
```

### 5. Sign Transaction
Signs a created transaction using the delegated key.

```http
POST /transaction/sign
```

**Request Body:**
```json
{
    "transactionId": "tx_id",
    "walletAddress": "0x..."
}
```

**Response:**
```json
{
    "success": true,
    "signature": "0x...",
    "transaction": {
        "id": "tx_id",
        "status": "signed",
        "walletAddress": "0x..."
    }
}
```

### 6. Submit Transaction
Submits a signed transaction to the blockchain.

```http
POST /transactions/{transactionId}/submit
```

**Response:**
```json
{
    "success": true,
    "transaction": {
        "id": "tx_id",
        "status": "submitted",
        "hash": "0x...",
        "walletAddress": "0x..."
    }
}
```

## Rate Limits
- Wallet Creation: 10 requests/minute
- Transaction Operations: 20 requests/minute
- Key Management: 10 requests/minute

## Error Responses
All endpoints return errors in the following format:
```json
{
    "success": false,
    "error": "Error message"
}
```

Common HTTP Status Codes:
- 200: Success
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 429: Too Many Requests
- 500: Internal Server Error

## Example Flow

1. Create a wallet:
```javascript
const createWallet = async () => {
    const response = await fetch('/wallet', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'your_api_key'
        },
        body: JSON.stringify({
            adminWalletAddress: '0x...'
        })
    });
    return await response.json();
};
```

2. Store delegated key:
```javascript
const storeDelegatedKey = async (privateKey, address) => {
    const response = await fetch('/delegated-key', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'your_api_key'
        },
        body: JSON.stringify({
            delegatedKeyPrivateKey: privateKey,
            delegatedKeyAddress: address
        })
    });
    return await response.json();
};
```

3. Create and submit a transaction:
```javascript
const createAndSubmitTransaction = async (walletAddress, to, value) => {
    // Create transaction
    const createResponse = await fetch('/transaction/create', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'your_api_key'
        },
        body: JSON.stringify({
            walletAddress,
            to,
            value
        })
    });
    const { transaction } = await createResponse.json();

    // Sign transaction
    const signResponse = await fetch('/transaction/sign', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'your_api_key'
        },
        body: JSON.stringify({
            transactionId: transaction.id,
            walletAddress
        })
    });
    await signResponse.json();

    // Submit transaction
    const submitResponse = await fetch(`/transactions/${transaction.id}/submit`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'your_api_key'
        }
    });
    return await submitResponse.json();
};
```

## Environment Variables
Required environment variables for the service:
```
CROSSMINT_API_KEY=your_crossmint_api_key
ADMIN_WALLET_ADDRESS=0x...
WALLET_ADDRESS=0x...
DELEGATED_KEY_ADDRESS=0x...
KMS_KEY_ID=your_kms_key_id
KEYS_TABLE_NAME=Xade_Crossmint
NODE_ENV=production|development
ALLOWED_ORIGINS=https://your-domain.com
```

## Security Notes
1. All private keys are encrypted using AWS KMS before storage
2. API keys should be rotated regularly
3. CORS is configured to only allow specific origins in production
4. Rate limiting is enabled to prevent abuse
5. All sensitive operations are logged for audit purposes 