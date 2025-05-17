# Xade API Documentation

This API provides endpoints for managing wallets, transactions, and token swaps using Crossmint and Li.Fi integration.

## Setup

### Environment Variables

Create a `.env` file with the following variables:

```env
NODE_ENV=development
AWS_REGION=ap-south-1
CROSSMINT_API_KEY=your_crossmint_api_key
KMS_KEY_ID=your_kms_key_id
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
ADMIN_WALLET_ADDRESS=your_admin_wallet_address
```

## API Endpoints

### 1. Create Wallet
Creates a new wallet with admin and delegated keys.

```http
POST /wallet
```

Response:
```json
{
    "success": true,
    "adminWallet": {
        "address": "0x...",
        "privateKey": "..."
    },
    "wallet": {
        "address": "0x...",
        "crossmintWalletId": "..."
    },
    "delegatedKey": {
        "address": "0x...",
        "crossmintSignerId": "..."
    }
}
```

### 2. Get Wallet
Retrieves wallet information.

```http
GET /wallet/{address}
```

Response:
```json
{
    "success": true,
    "wallet": {
        "address": "0x...",
        "type": "evm-smart-wallet",
        "config": {
            "adminSigner": {
                "type": "evm-keypair",
                "address": "0x..."
            }
        }
    }
}
```

### 3. Create Li.Fi Transaction
Creates a token swap transaction using Li.Fi.

```http
POST /transaction/lifi
```

Request Body:
```json
{
    "fromToken": "0x...",
    "toToken": "0x...",
    "amount": "1000000000000000000",
    "fromAddress": "0x...",
    "toAddress": "0x...",
    "fromChain": "137",
    "toChain": "137",
    "slippage": 0.5
}
```

Response:
```json
{
    "success": true,
    "unsignedTx": {
        "from": "0x...",
        "to": "0x...",
        "data": "0x...",
        "value": "0x...",
        "chainId": 137
    },
    "quote": {
        "fromToken": {
            "address": "0x...",
            "symbol": "..."
        },
        "toToken": {
            "address": "0x...",
            "symbol": "..."
        },
        "fromAmount": "...",
        "toAmount": "..."
    }
}
```

### 4. Sign and Submit Transaction
Signs and submits a transaction to the blockchain.

```http
POST /transaction/sign-and-submit
```

Request Body:
```json
{
    "walletAddress": "0x...",
    "unsignedTx": {
        "from": "0x...",
        "to": "0x...",
        "data": "0x...",
        "value": "0x...",
        "chainId": 137
    }
}
```

Response:
```json
{
    "success": true,
    "txHash": "0x...",
    "txResponse": {
        "hash": "0x...",
        "from": "0x...",
        "to": "0x...",
        "value": "0x..."
    }
}
```

## Postman Setup

1. Create a new collection in Postman
2. Add the following environment variables:
   - `base_url`: Your API base URL
   - `crossmint_api_key`: Your Crossmint API key

3. Add the following headers to all requests:
   ```
   Content-Type: application/json
   x-api-key: {{crossmint_api_key}}
   ```

4. Create requests for each endpoint:
   - Create Wallet: `POST {{base_url}}/wallet`
   - Get Wallet: `GET {{base_url}}/wallet/{address}`
   - Create Li.Fi Transaction: `POST {{base_url}}/transaction/lifi`
   - Sign and Submit Transaction: `POST {{base_url}}/transaction/sign-and-submit`

## Production Considerations

1. **Security**:
   - Always use HTTPS in production
   - Keep API keys and private keys secure
   - Use environment variables for sensitive data
   - Implement rate limiting
   - Add request validation

2. **Monitoring**:
   - Set up logging and monitoring
   - Track transaction statuses
   - Monitor wallet balances
   - Set up alerts for failed transactions

3. **Error Handling**:
   - Implement proper error responses
   - Add retry mechanisms for failed transactions
   - Handle network issues gracefully

4. **Performance**:
   - Use caching where appropriate
   - Optimize database queries
   - Consider using a CDN for static content

## Development vs Production

The API automatically switches between development and production environments based on the `NODE_ENV` variable:

- Development: Uses Polygon Amoy testnet
- Production: Uses Polygon mainnet

## Support

For any issues or questions, please contact the development team. 