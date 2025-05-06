# Xade Wallet Service

A serverless API service for managing EVM smart wallets and transactions.

## Prerequisites

- Node.js 20.x or later
- AWS CLI configured with appropriate credentials
- Serverless Framework installed globally (`npm install -g serverless`)

## Environment Setup

1. Create a `.env.production` file with the following variables:
```env
CROSSMINT_API_KEY=your_crossmint_api_key
ADMIN_WALLET_ADDRESS=your_admin_wallet_address
WALLET_ADDRESS=your_wallet_address
DELEGATED_KEY_ADDRESS=your_delegated_key_address
DELEGATED_KEY_PRIVATE_KEY=your_delegated_key_private_key
```

2. Install dependencies:
```bash
npm install
```

## Testing the Service

### Option 1: Step-by-Step Testing

Use the `test-wallet-flow.js` script to test the complete wallet and transaction flow:

```bash
node test-wallet-flow.js
```

This script will:
1. Validate your environment variables
2. Create a new wallet
3. Create a transaction
4. Sign the transaction
5. Approve the transaction
6. Submit the transaction to the blockchain

Each step is clearly logged, and any errors are caught and displayed with detailed information.

### Option 2: Individual Endpoint Testing

You can test individual endpoints using the `test-api.js` script:

```bash
node test-api.js
```

This script tests each endpoint separately:
- `/wallet` - Create a new wallet
- `/transaction/create` - Create a new transaction
- `/transaction/sign` - Sign a transaction
- `/transaction/approve` - Approve a transaction
- `/transactions/{transactionId}/submit` - Submit a transaction to the blockchain
- `/keys` - Manage wallet keys

### Troubleshooting

If you encounter errors:

1. Check your environment variables:
```bash
node -e "require('dotenv').config(); console.log(process.env)"
```

2. Verify your Crossmint API key is valid and has the necessary permissions

3. Ensure your wallet addresses are in the correct format (0x followed by 40 hexadecimal characters)

4. Check the AWS CloudWatch logs for detailed error information:
```bash
serverless logs -f functionName --stage prod
```

## API Endpoints

- `POST /wallet` - Create a new wallet
- `POST /transaction/create` - Create a new transaction
- `POST /transaction/sign` - Sign a transaction
- `POST /transaction/approve` - Approve a transaction
- `POST /transactions/{transactionId}/submit` - Submit a transaction to the blockchain
- `POST /keys` - Manage wallet keys

## Deployment

Deploy to production:
```bash
npm run deploy:prod
```

Deploy to staging:
```bash
npm run deploy:staging
```

## Development

Start the local development server:
```bash
npm run dev
```

This will start the serverless offline server at `http://localhost:4000`. 