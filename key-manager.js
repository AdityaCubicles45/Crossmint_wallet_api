const AWS = require('aws-sdk');
const crypto = require('crypto');
const ethers = require('ethers');

// Initialize AWS KMS
const kms = new AWS.KMS({
    region: process.env.AWS_REGION || 'ap-south-1'
});

class KeyManager {
    constructor() {
        this.encryptedKeys = {};
        this.tableName = process.env.KEYS_TABLE_NAME || 'xade-wallet-service-prod-keys';
    }

    // Create a new wallet and store its keys
    async createWallet(adminWalletAddress) {
        try {
            console.log('Creating new wallet...');
            
            // Generate new wallet
            const wallet = ethers.Wallet.createRandom();
            const walletAddress = wallet.address;
            const privateKey = wallet.privateKey;

            // Generate delegated key
            const delegatedWallet = ethers.Wallet.createRandom();
            const delegatedKeyAddress = delegatedWallet.address;
            const delegatedKeyPrivateKey = delegatedWallet.privateKey;

            // Encrypt both keys using KMS
            console.log('Encrypting keys with KMS...');
            const [walletEncryptResult, delegatedEncryptResult] = await Promise.all([
                kms.encrypt({
                    KeyId: process.env.KMS_KEY_ID,
                    Plaintext: Buffer.from(privateKey)
                }).promise(),
                kms.encrypt({
                    KeyId: process.env.KMS_KEY_ID,
                    Plaintext: Buffer.from(delegatedKeyPrivateKey)
                }).promise()
            ]);

            const encryptedWalletKey = walletEncryptResult.CiphertextBlob.toString('base64');
            const encryptedDelegatedKey = delegatedEncryptResult.CiphertextBlob.toString('base64');

            // Store in DynamoDB
            console.log('Storing keys in DynamoDB...');
            const dynamoDB = new AWS.DynamoDB.DocumentClient({
                region: process.env.AWS_REGION || 'ap-south-1'
            });

            const params = {
                TableName: this.tableName,
                Item: {
                    address: walletAddress,
                    adminWalletAddress,
                    encryptedWalletKey,
                    encryptedDelegatedKey,
                    delegatedKeyAddress,
                    createdAt: new Date().toISOString(),
                    type: 'wallet'
                }
            };

            await dynamoDB.put(params).promise();
            console.log('Wallet created and keys stored successfully');

            return {
                success: true,
                message: 'Wallet created successfully',
                walletAddress,
                delegatedKeyAddress
            };
        } catch (error) {
            console.error('Error creating wallet:', error);
            console.error('Error stack:', error.stack);
            throw new Error('Failed to create wallet');
        }
    }

    // Store delegated key dynamically
    async storeDelegatedKey(delegatedKeyPrivateKey, delegatedKeyAddress) {
        try {
            console.log('Starting storeDelegatedKey...');
            console.log('Parameters:', { delegatedKeyAddress, privateKeyLength: delegatedKeyPrivateKey?.length });
            console.log('ENV VARS:', {
                region: process.env.AWS_REGION,
                keyId: process.env.KMS_KEY_ID,
                tableName: process.env.KEYS_TABLE_NAME
            });

            if (!delegatedKeyPrivateKey || !delegatedKeyAddress) {
                throw new Error('Missing required parameters: delegatedKeyPrivateKey or delegatedKeyAddress');
            }

            // Encrypt the key using KMS
            console.log('Encrypting key with KMS...');
            let encryptResult;
            try {
                encryptResult = await kms.encrypt({
                    KeyId: process.env.KMS_KEY_ID,
                    Plaintext: Buffer.from(delegatedKeyPrivateKey)
                }).promise();
            } catch (e) {
                console.error('KMS Encryption failed:', e.message);
                throw new Error('Failed to encrypt delegated key with KMS');
            }

            console.log('Key encrypted successfully');
            const encryptedKey = encryptResult.CiphertextBlob.toString('base64');

            // Store in DynamoDB with a special identifier
            console.log('Storing in DynamoDB...');
            const dynamoDB = new AWS.DynamoDB.DocumentClient({
                region: process.env.AWS_REGION || 'ap-south-1'
            });

            const params = {
                TableName: this.tableName,
                Item: {
                    address: delegatedKeyAddress,
                    encryptedKey,
                    createdAt: new Date().toISOString(),
                    type: 'delegated'
                }
            };
            console.log('DynamoDB params:', JSON.stringify(params, null, 2));

            try {
                await dynamoDB.put(params).promise();
            } catch (e) {
                console.error('DynamoDB put failed:', e.message);
                throw new Error('Failed to save encrypted key to DynamoDB');
            }

            console.log('Key stored in DynamoDB successfully');
            return {
                success: true,
                message: 'Delegated key stored successfully',
                delegatedKeyAddress
            };
        } catch (error) {
            console.error('Error storing delegated key:', error);
            console.error('Error stack:', error.stack);
            throw new Error('Failed to store delegated key');
        }
    }

    // Decrypt the delegated key from environment variable or DynamoDB
    async decryptDelegatedKey() {
        try {
            const dynamoDB = new AWS.DynamoDB.DocumentClient({
                region: process.env.AWS_REGION || 'ap-south-1'
            });

            const result = await dynamoDB.get({
                TableName: this.tableName,
                Key: {
                    address: process.env.DELEGATED_KEY_ADDRESS
                }
            }).promise();

            let encryptedKey;
            let delegatedKeyAddress;

            if (result.Item) {
                encryptedKey = result.Item.encryptedKey;
                delegatedKeyAddress = result.Item.address;
            } else {
                encryptedKey = process.env.ENCRYPTED_DELEGATED_KEY;
                delegatedKeyAddress = process.env.DELEGATED_KEY_ADDRESS;
            }

            if (!encryptedKey) {
                throw new Error('No delegated key found');
            }

            const decryptResult = await kms.decrypt({
                CiphertextBlob: Buffer.from(encryptedKey, 'base64'),
                KeyId: process.env.KMS_KEY_ID
            }).promise();

            return {
                success: true,
                delegatedKeyAddress,
                delegatedKeyPrivateKey: decryptResult.Plaintext.toString('utf8')
            };
        } catch (error) {
            console.error('Error decrypting delegated key:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async storeKeys(walletAddress, delegatedKeyAddress, delegatedKeyPrivateKey) {
        try {
            const dataKey = await kms.generateDataKey({
                KeyId: process.env.KMS_KEY_ID,
                KeySpec: 'AES_256'
            }).promise();

            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-gcm', dataKey.Plaintext, iv);

            const encryptedPrivateKey = Buffer.concat([
                cipher.update(delegatedKeyPrivateKey, 'utf8'),
                cipher.final()
            ]);

            this.encryptedKeys[walletAddress] = {
                delegatedKeyAddress,
                encryptedPrivateKey: encryptedPrivateKey.toString('base64'),
                encryptedDataKey: dataKey.CiphertextBlob.toString('base64'),
                iv: iv.toString('base64'),
                authTag: cipher.getAuthTag().toString('base64')
            };

            await this.saveToDynamoDB(walletAddress);

            return {
                success: true,
                message: 'Keys stored successfully'
            };
        } catch (error) {
            console.error('Error storing keys:', error);
            throw error;
        }
    }

    async retrieveKeys(walletAddress) {
        try {
            if (!walletAddress) {
                const decryptedKey = await this.decryptDelegatedKey();
                return {
                    delegatedKeyAddress: process.env.DELEGATED_KEY_ADDRESS,
                    delegatedKeyPrivateKey: decryptedKey
                };
            }

            const keys = await this.getFromDynamoDB(walletAddress);
            if (!keys) {
                throw new Error('Keys not found');
            }

            const decryptedDataKey = await kms.decrypt({
                CiphertextBlob: Buffer.from(keys.encryptedDataKey, 'base64')
            }).promise();

            const decipher = crypto.createDecipheriv(
                'aes-256-gcm',
                decryptedDataKey.Plaintext,
                Buffer.from(keys.iv, 'base64')
            );
            decipher.setAuthTag(Buffer.from(keys.authTag, 'base64'));

            const decryptedPrivateKey = Buffer.concat([
                decipher.update(Buffer.from(keys.encryptedPrivateKey, 'base64')),
                decipher.final()
            ]).toString('utf8');

            return {
                delegatedKeyAddress: keys.delegatedKeyAddress,
                delegatedKeyPrivateKey: decryptedPrivateKey
            };
        } catch (error) {
            console.error('Error retrieving keys:', error);
            throw error;
        }
    }

    async saveToDynamoDB(walletAddress) {
        const dynamoDB = new AWS.DynamoDB.DocumentClient({
            region: process.env.AWS_REGION || 'ap-south-1'
        });
        const params = {
            TableName: this.tableName,
            Item: {
                address: walletAddress,
                ...this.encryptedKeys[walletAddress],
                createdAt: new Date().toISOString()
            }
        };

        await dynamoDB.put(params).promise();
    }

    async getFromDynamoDB(walletAddress) {
        const dynamoDB = new AWS.DynamoDB.DocumentClient({
            region: process.env.AWS_REGION || 'ap-south-1'
        });
        const params = {
            TableName: this.tableName,
            Key: {
                address: walletAddress
            }
        };

        const result = await dynamoDB.get(params).promise();
        return result.Item;
    }

    async getDelegatedKey(address) {
        try {
            console.log('Getting delegated key for address:', address);
            const dynamoDB = new AWS.DynamoDB.DocumentClient({
                region: process.env.AWS_REGION || 'ap-south-1'
            });

            const params = {
                TableName: this.tableName,
                Key: {
                    address: address
                }
            };
            console.log('DynamoDB get params:', JSON.stringify(params, null, 2));

            const result = await dynamoDB.get(params).promise();
            console.log('DynamoDB result:', JSON.stringify(result, null, 2));

            if (!result.Item || !result.Item.encryptedKey) {
                throw new Error('Delegated key not found');
            }

            // Decrypt the key using KMS
            console.log('Decrypting key with KMS...');
            const decryptResult = await kms.decrypt({
                CiphertextBlob: Buffer.from(result.Item.encryptedKey, 'base64'),
                KeyId: process.env.KMS_KEY_ID
            }).promise();

            console.log('Key decrypted successfully');
            return {
                success: true,
                delegatedKeyAddress: result.Item.address,
                delegatedKeyPrivateKey: decryptResult.Plaintext.toString('utf8')
            };
        } catch (error) {
            console.error('Error retrieving delegated key:', error);
            console.error('Error stack:', error.stack);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Update the handler to include createWallet action
    async handleRequest(action, params) {
        switch (action) {
            case 'createWallet':
                return await this.createWallet(params.adminWalletAddress);
            case 'storeDelegatedKey':
                return await this.storeDelegatedKey(params.delegatedKeyPrivateKey, params.delegatedKeyAddress);
            case 'getDelegatedKey':
                return await this.getDelegatedKey(params.address);
            default:
                throw new Error(`Invalid action: ${action}`);
        }
    }
}

exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    try {
        const body = JSON.parse(event.body);
        console.log('Parsed body:', JSON.stringify(body, null, 2));
        
        const { action, ...params } = body;
        console.log('Extracted parameters:', { action, ...params });
        
        if (!action) {
            throw new Error('Missing required parameter: action');
        }

        const keyManager = new KeyManager();
        console.log('KeyManager initialized with table:', keyManager.tableName);
        
        const result = await keyManager.handleRequest(action, params);
        console.log('Operation result:', JSON.stringify(result, null, 2));
        
        return {
            statusCode: 200,
            body: JSON.stringify(result)
        };
    } catch (error) {
        console.error('Error in handler:', error);
        console.error('Error stack:', error.stack);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: error.message || 'Internal server error',
                stack: error.stack
            })
        };
    }
};
