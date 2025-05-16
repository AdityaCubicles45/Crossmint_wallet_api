# Xade Wallet Service

A secure serverless wallet management service built with AWS Lambda, providing secure key storage and management capabilities.

## Features

- 🔐 Secure wallet creation and management
- 🔑 Delegated key generation and storage (automatic)
- 🔒 AWS KMS encryption for all sensitive data
- 📦 Serverless architecture using AWS Lambda
- 🔐 API key authentication
- 💾 DynamoDB for secure key storage

## Prerequisites

- Node.js 20.x or later
- AWS CLI configured with appropriate credentials
- Serverless Framework installed globally
- An AWS account with appropriate permissions

## Environment Variables

Create a `.env.dev` file with the following variables:

```env
CROSSMINT_API_KEY=your_crossmint_api_key
ADMIN_WALLET_ADDRESS=your_admin_wallet_address
WALLET_ADDRESS=your_wallet_address
DELEGATED_KEY_ADDRESS=your_delegated_key_address
KMS_KEY_ID=your_kms_key_id
KEYS_TABLE_NAME=your_dynamodb_table_name
API_KEY=your_api_gateway_key
DELEGATED_KEY_PRIVATE_KEY=your_delegated_key_private_key
```

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd xade-wallet-service
```

2. Install dependencies:
```bash
npm install
```

3. Deploy to AWS:
```bash
serverless deploy
```

## API Endpoints

### Key Management

#### Create Wallet (delegated key is stored automatically)
```http
POST /wallet
Content-Type: application/json
x-api-key: your-api-key

{
    "adminWalletAddress": "0x..."
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

#### Get Delegated Key (for internal use/testing only)
```http
POST /keys
Content-Type: application/json
x-api-key: your-api-key

{
    "action": "getDelegatedKey",
    "address": "0x..."
}
```

## Testing

Run the test suite:
```bash
node test.js
```

The test suite verifies:
1. Wallet creation (delegated key is stored automatically)
2. Key retrieval and verification

## Security Features

- **AWS KMS Encryption**: All sensitive data is encrypted using AWS KMS
- **API Key Authentication**: All endpoints require valid API key
- **Secure Storage**: Keys are stored in DynamoDB with encryption
- **Environment Variables**: Sensitive configuration is managed through environment variables
- **IAM Roles**: Least privilege access through IAM roles

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   API       │     │   Lambda    │     │   DynamoDB  │
│  Gateway    │────▶│  Function   │────▶│   Table     │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   ▲
       │                   │                   │
       │                   ▼                   │
       │            ┌─────────────┐           │
       └───────────▶│    KMS      │───────────┘
                    └─────────────┘
```

## AWS Resources

- **Lambda Functions**:
  - `keyManager`: Main key management function
  - `createWallet`: Wallet creation function
  - `storeDelegatedKey`: Delegated key storage function

- **DynamoDB**:
  - Table: `Xade_Crossmint`
  - Primary Key: `address` (String)

- **KMS**:
  - Customer managed key for encryption

- **API Gateway**:
  - REST API with API key authentication
  - Private endpoints

## Error Handling

The service includes comprehensive error handling:
- Input validation
- API key verification
- KMS encryption/decryption errors
- DynamoDB operation errors
- Proper error responses with status codes

## Logging

- CloudWatch Logs for all Lambda functions
- Detailed error logging
- Request/response logging
- Operation status logging

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, please open an issue in the repository or contact the development team. 