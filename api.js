const AWS = require('aws-sdk');
const axios = require('axios');
const { ethers } = require('ethers');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuration
const config = {
    development: {
        apiUrl: 'https://staging.crossmint.com/api/2022-06-09',
        chain: 'polygon-amoy',
        chainId: 80002,
        rpcUrl: 'https://rpc-amoy.polygon.technology',
        tokenContracts: {
            WMATIC: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889'
        }
    },
    production: {
        apiUrl: 'https://www.crossmint.com/api/2022-06-09',
        chain: 'polygon',
        chainId: 137,
        rpcUrl: 'https://polygon-rpc.com',
        tokenContracts: {
            WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
        }
    }
};

const environment = process.env.NODE_ENV || 'development';
const currentConfig = config[environment];

// Initialize AWS services
const kms = new AWS.KMS({
    region: process.env.AWS_REGION || 'ap-south-1'
});

const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION || 'ap-south-1'
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Structured logging
const log = (level, message, data = {}) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        environment: process.env.NODE_ENV,
        ...data
    };
    console.log(JSON.stringify(logEntry));
};

// Axios instance with default config
const axiosInstance = axios.create({
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Add request interceptor for logging and API key
axiosInstance.interceptors.request.use(
    config => {
        // Add API key to all requests
        config.headers['x-api-key'] = process.env.CROSSMINT_API_KEY;
        
        log('info', 'API Request', {
            url: config.url,
            method: config.method,
            headers: config.headers
        });
        return config;
    },
    error => {
        log('error', 'API Request Error', {
            error: error.message
        });
        return Promise.reject(error);
    }
);

// Add response interceptor for logging
axiosInstance.interceptors.response.use(
    response => {
        log('info', 'API Response', {
            url: response.config.url,
            method: response.config.method,
            status: response.status
        });
        return response;
    },
    error => {
        log('error', 'API Error', {
            url: error.config?.url,
            method: error.config?.method,
            status: error.response?.status,
            message: error.message,
            responseData: error.response?.data
        });
        return Promise.reject(error);
    }
);

// Validation functions
const validateEnvironment = () => {
    const requiredEnvVars = [
        'ADMIN_WALLET_ADDRESS',
        'CROSSMINT_API_KEY',
        'KMS_KEY_ID',
        'KEYS_TABLE_NAME'
    ];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        const error = `Missing required environment variables: ${missingVars.join(', ')}`;
        log('error', error);
        throw new Error(error);
    }
};

const validateWalletAddress = (address) => {
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        const error = `Invalid wallet address: ${address}`;
        log('error', error);
        throw new Error(error);
    }
    return true;
};

// Response helper with CORS headers
const createResponse = (statusCode, data) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production' 
            ? process.env.ALLOWED_ORIGINS || '*' 
            : '*',
        'Access-Control-Allow-Credentials': true,
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
    },
    body: JSON.stringify(data)
});

// Key Manager Class
class KeyManager {
    constructor() {
        this.tableName = process.env.SUPABASE_WALLETS_TABLE || 'wallets';
        log('info', 'KeyManager initialized', { tableName: this.tableName });
    }

    async createWallet(adminWalletAddress) {
        try {
            log('info', 'Creating new wallet...');
            // Generate new wallet
            const wallet = ethers.Wallet.createRandom();
            const walletAddress = wallet.address;
            const privateKey = wallet.privateKey;

            // Generate delegated key
            const delegatedWallet = ethers.Wallet.createRandom();
            const delegatedKeyAddress = delegatedWallet.address;
            const delegatedKeyPrivateKey = delegatedWallet.privateKey;

            // Encrypt both keys using KMS
            log('info', 'Encrypting keys with KMS...');
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

            // Store non-sensitive metadata in Supabase
            log('info', 'Storing wallet metadata in Supabase...');
            const { error } = await supabase.from(this.tableName).insert([
                {
                    address: walletAddress,
                    adminWalletAddress,
                    encryptedWalletKey,
                    encryptedDelegatedKey,
                    delegatedKeyAddress,
                    createdAt: new Date().toISOString(),
                    type: 'wallet'
                }
            ]);
            if (error) throw new Error('Supabase insert error: ' + error.message);

            log('info', 'Wallet created and metadata stored successfully', {
                walletAddress,
                delegatedKeyAddress
            });

            return {
                success: true,
                message: 'Wallet created successfully',
                walletAddress,
                delegatedKeyAddress
            };
        } catch (error) {
            log('error', 'Error creating wallet', {
                error: error.message,
                stack: error.stack
            });
            throw new Error('Failed to create wallet');
        }
    }

    async getDelegatedKey(address) {
        try {
            log('info', 'Getting delegated key for address:', address);
            // Fetch encrypted key from Supabase
            const { data, error } = await supabase
                .from(this.tableName)
                .select('encryptedDelegatedKey,delegatedKeyAddress')
                .eq('address', address)
                .single();
            if (error || !data || !data.encryptedDelegatedKey) {
                throw new Error('Delegated key not found');
            }
            // Decrypt the key using KMS
            log('info', 'Decrypting key with KMS...');
            const decryptResult = await kms.decrypt({
                CiphertextBlob: Buffer.from(data.encryptedDelegatedKey, 'base64'),
                KeyId: process.env.KMS_KEY_ID
            }).promise();
            log('info', 'Key decrypted successfully');
            return {
                success: true,
                delegatedKeyAddress: data.delegatedKeyAddress,
                delegatedKeyPrivateKey: decryptResult.Plaintext.toString('utf8')
            };
        } catch (error) {
            log('error', 'Error retrieving delegated key:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// API Handlers
const createWallet = async (event) => {
    try {
        validateEnvironment();
        
        log('info', 'Starting automatic wallet creation process...', {
            environment: process.env.NODE_ENV,
            apiUrl: currentConfig.apiUrl
        });

        // Step 1: Generate new admin wallet
        const adminWallet = ethers.Wallet.createRandom();
        const adminWalletAddress = adminWallet.address;
        const adminPrivateKey = adminWallet.privateKey;
        
        log('info', 'Generated new admin wallet', { adminWalletAddress });

        // Step 2: Generate new wallet and delegated key
        const keyManager = new KeyManager();
        const result = await keyManager.createWallet(adminWalletAddress);

        log('info', 'Generated new wallet and delegated key', {
            walletAddress: result.walletAddress,
            delegatedKeyAddress: result.delegatedKeyAddress
        });

        // Step 3: Create wallet in Crossmint
        const walletPayload = {
            type: 'evm-smart-wallet',
            config: {
                adminSigner: {
                    type: 'evm-keypair',
                    address: adminWalletAddress
                }
            }
        };

        log('info', 'Creating wallet in Crossmint', {
            payload: walletPayload,
            apiUrl: `${currentConfig.apiUrl}/wallets`,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.CROSSMINT_API_KEY ? 'present' : 'missing'
            }
        });

        const wallet = await axiosInstance.post(`${currentConfig.apiUrl}/wallets`, walletPayload);

        if (wallet.status !== 201) {
            throw new Error(`Failed to create wallet: ${wallet.data.message || 'Unknown error'}`);
        }

        // Use the Crossmint wallet address for all further Crossmint API calls
        const crossmintWalletAddress = wallet.data.address;

        log('info', 'Created wallet in Crossmint', { 
            walletAddress: result.walletAddress,
            crossmintWalletAddress: crossmintWalletAddress,
            crossmintWalletId: wallet.data.id,
            status: wallet.status,
            response: wallet.data
        });

        // Step 4: Register delegated key using the Crossmint wallet address
        const delegatedKey = await axiosInstance.post(
            `${currentConfig.apiUrl}/wallets/${crossmintWalletAddress}/signers`,
            {
                signer: `evm-keypair:${result.delegatedKeyAddress}`,
                chain: currentConfig.chain
            }
        );

        log('info', 'Registered delegated key in Crossmint', {
            delegatedKeyAddress: result.delegatedKeyAddress,
            crossmintSignerId: delegatedKey.data.id
        });

        // Step 5: Return complete wallet information
        return createResponse(200, {
            success: true,
            adminWallet: {
                address: adminWalletAddress,
                privateKey: adminPrivateKey
            },
            wallet: {
                address: result.walletAddress,
                crossmintWalletId: wallet.data.id,
                ...wallet.data
            },
            delegatedKey: {
                address: result.delegatedKeyAddress,
                crossmintSignerId: delegatedKey.data.id,
                ...delegatedKey.data
            },
            status: {
                walletCreated: true,
                delegatedKeyRegistered: true,
                keysStored: true
            }
        });
    } catch (error) {
        log('error', 'Error in automatic wallet creation', { 
            error: error.message,
            response: error.response?.data,
            stack: error.stack
        });
        return createResponse(error.response?.status || 500, {
            success: false,
            error: error.response?.data?.message || error.message,
            status: {
                walletCreated: false,
                delegatedKeyRegistered: false,
                keysStored: false
            }
        });
    }
};

const storeDelegatedKey = async (event) => {
    try {
        log('info', 'Storing delegated key...');
        const body = JSON.parse(event.body);
        const { delegatedKeyPrivateKey, delegatedKeyAddress } = body;

        if (!delegatedKeyPrivateKey || !delegatedKeyAddress) {
            return createResponse(400, {
                success: false,
                error: 'Missing required parameters: delegatedKeyPrivateKey or delegatedKeyAddress'
            });
        }

        if (!validateWalletAddress(delegatedKeyAddress)) {
            return createResponse(400, {
                success: false,
                error: 'Invalid delegated key address format'
            });
        }

        const keyManager = new KeyManager();
        const result = await keyManager.getDelegatedKey(delegatedKeyAddress);

        return createResponse(200, {
            success: true,
            message: 'Delegated key stored successfully',
            delegatedKeyAddress: result.delegatedKeyAddress
        });
    } catch (error) {
        log('error', 'Error storing delegated key', { error: error.message });
        return createResponse(500, {
            success: false,
            error: error.message
        });
    }
};

const createTransaction = async (event) => {
    try {
        log('info', 'Creating transaction...');
        const body = JSON.parse(event.body);
        const { walletAddress, to, value, data } = body;

        if (!walletAddress || !to || !value) {
            return createResponse(400, {
                success: false,
                error: 'Missing required parameters'
            });
        }

        if (!validateWalletAddress(walletAddress) || !validateWalletAddress(to)) {
            return createResponse(400, {
                success: false,
                error: 'Invalid wallet address format'
            });
        }

        const transactionResponse = await axiosInstance.post(
            `${currentConfig.apiUrl}/wallets/${walletAddress}/transactions`,
            {
                params: {
                    chain: currentConfig.chain,
                    calls: [{
                        address: to,
                        value,
                        data: data || '0x'
                    }],
                    signer: `evm-keypair:${process.env.ADMIN_WALLET_ADDRESS}`
                }
            },
            {
                headers: {
                    'x-api-key': process.env.CROSSMINT_API_KEY
                }
            }
        );

        return createResponse(200, {
            success: true,
            transaction: transactionResponse.data
        });
    } catch (error) {
        log('error', 'Error creating transaction', { 
            error: error.message,
            response: error.response?.data
        });
        return createResponse(error.response?.status || 500, {
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
};

const signTransaction = async (event) => {
    try {
        log('info', 'Signing transaction...');
        const body = JSON.parse(event.body);
        const { transactionId, walletAddress } = body;

        if (!transactionId || !walletAddress) {
            return createResponse(400, {
                success: false,
                error: 'Missing required parameters'
            });
        }

        if (!validateWalletAddress(walletAddress)) {
            return createResponse(400, {
                success: false,
                error: 'Invalid wallet address format'
            });
        }

        const transactionResponse = await axiosInstance.get(
            `${currentConfig.apiUrl}/wallets/${walletAddress}/transactions/${transactionId}`,
            {
                headers: {
                    'x-api-key': process.env.CROSSMINT_API_KEY
                }
            }
        );

        const keyManager = new KeyManager();
        const delegatedKey = await keyManager.getDelegatedKey(walletAddress);

        if (!delegatedKey.success) {
            throw new Error(delegatedKey.error);
        }

        const wallet = new ethers.Wallet(delegatedKey.delegatedKeyPrivateKey);
        const signature = await wallet.signMessage(transactionResponse.data.message);

        return createResponse(200, {
            success: true,
            signature,
            transaction: transactionResponse.data
        });
    } catch (error) {
        log('error', 'Error signing transaction', { 
            error: error.message,
            response: error.response?.data
        });
        return createResponse(error.response?.status || 500, {
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
};

const submitTransactionToBlockchain = async (event) => {
    try {
        const transactionId = event.pathParameters.transactionId;
        const walletAddress = process.env.WALLET_ADDRESS;

        const transactionResponse = await axiosInstance.get(
            `${currentConfig.apiUrl}/wallets/${walletAddress}/transactions/${transactionId}`,
            {
                headers: {
                    'x-api-key': process.env.CROSSMINT_API_KEY
                }
            }
        );

        const submitResponse = await axiosInstance.post(
            `${currentConfig.apiUrl}/wallets/${walletAddress}/transactions/${transactionId}/submit`,
            {},
            {
                headers: {
                    'x-api-key': process.env.CROSSMINT_API_KEY
                }
            }
        );

        return createResponse(200, {
            success: true,
            transaction: submitResponse.data
        });
    } catch (error) {
        log('error', 'Error submitting transaction to blockchain', { 
            error: error.message,
            response: error.response?.data
        });
        return createResponse(error.response?.status || 500, {
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
};

const getWallet = async (event) => {
    try {
        log('info', 'Getting wallet...');
        const address = event.pathParameters?.address || process.env.WALLET_ADDRESS;
        
        if (!validateWalletAddress(address)) {
            return createResponse(400, {
                success: false,
                error: 'Invalid wallet address format'
            });
        }

        const walletResponse = await axiosInstance.get(
            `${currentConfig.apiUrl}/wallets/${address}`,
            {
                headers: {
                    'x-api-key': process.env.CROSSMINT_API_KEY
                }
            }
        );

        return createResponse(200, {
            success: true,
            wallet: walletResponse.data
        });
    } catch (error) {
        log('error', 'Error getting wallet', { 
            error: error.message,
            response: error.response?.data
        });
        return createResponse(error.response?.status || 500, {
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
};

const getDelegatedKey = async (event) => {
    try {
        log('info', 'Getting delegated key...');
        const address = event.pathParameters?.address;
        
        if (!address || !validateWalletAddress(address)) {
            return createResponse(400, {
                success: false,
                error: 'Invalid wallet address format'
            });
        }

        const keyManager = new KeyManager();
        const result = await keyManager.getDelegatedKey(address);

        if (!result.success) {
            return createResponse(404, {
                success: false,
                error: result.error
            });
        }

        return createResponse(200, {
            success: true,
            delegatedKeyAddress: result.delegatedKeyAddress
        });
    } catch (error) {
        log('error', 'Error getting delegated key', { error: error.message });
        return createResponse(500, {
            success: false,
            error: error.message
        });
    }
};

const getTransaction = async (event) => {
    try {
        log('info', 'Getting transaction...');
        const transactionId = event.pathParameters.transactionId;
        const walletAddress = process.env.WALLET_ADDRESS;

        if (!transactionId) {
            return createResponse(400, {
                success: false,
                error: 'Missing transaction ID'
            });
        }

        const transactionResponse = await axiosInstance.get(
            `${currentConfig.apiUrl}/wallets/${walletAddress}/transactions/${transactionId}`,
            {
                headers: {
                    'x-api-key': process.env.CROSSMINT_API_KEY
                }
            }
        );

        return createResponse(200, {
            success: true,
            transaction: transactionResponse.data
        });
    } catch (error) {
        log('error', 'Error getting transaction', { error: error.message });
        return createResponse(500, {
            success: false,
            error: error.message
        });
    }
};

const signAndSubmitTransaction = async (event) => {
    try {
        log('info', 'Sign and submit transaction...');
        const body = JSON.parse(event.body);
        const { unsignedTx, walletAddress } = body;

        if (!unsignedTx || !walletAddress) {
            return createResponse(400, {
                success: false,
                error: 'Missing required parameters: unsignedTx or walletAddress'
            });
        }

        if (!validateWalletAddress(walletAddress)) {
            return createResponse(400, {
                success: false,
                error: 'Invalid wallet address format'
            });
        }

        // Retrieve delegated key
        const keyManager = new KeyManager();
        const delegatedKey = await keyManager.getDelegatedKey(walletAddress);

        if (!delegatedKey.success) {
            throw new Error(delegatedKey.error);
        }

        // Sign the transaction
        const wallet = new ethers.Wallet(delegatedKey.delegatedKeyPrivateKey);
        const signedTx = await wallet.signTransaction(unsignedTx);

        // Submit the signed transaction to the blockchain
        const provider = new ethers.providers.JsonRpcProvider(currentConfig.rpcUrl);
        const txResponse = await provider.sendTransaction(signedTx);

        return createResponse(200, {
            success: true,
            txHash: txResponse.hash,
            txResponse
        });
    } catch (error) {
        log('error', 'Error signing and submitting transaction', { 
            error: error.message,
            stack: error.stack
        });
        return createResponse(500, {
            success: false,
            error: error.message
        });
    }
};

// Main handler
exports.handler = async (event) => {
    try {
        // Handle OPTIONS request for CORS
        if (event.httpMethod === 'OPTIONS') {
            return createResponse(200, {});
        }

        const path = event.path;
        const method = event.httpMethod;

        log('info', 'Processing request', {
            path,
            method
        });

        // Route handling
        if (path === '/wallet' && method === 'POST') {
            // This is the main entry point for automatic wallet creation
            return await createWallet(event);
        }
        if (path === '/wallet' && method === 'GET') {
            return await getWallet(event);
        }
        if (path.match(/\/wallet\/.*/) && method === 'GET') {
            return await getWallet(event);
        }
        if (path.match(/\/transactions\/.*/) && method === 'GET') {
            return await getTransaction(event);
        }
        if (path.match(/\/transactions\/.*\/submit/) && method === 'POST') {
            return await submitTransactionToBlockchain(event);
        }
        if (path === '/transaction/sign-and-submit' && method === 'POST') {
            return await signAndSubmitTransaction(event);
        }

        return createResponse(404, {
            success: false,
            error: 'Not Found'
        });
    } catch (error) {
        log('error', 'Handler error', { 
            error: error.message,
            stack: error.stack
        });
        return createResponse(500, {
            success: false,
            error: 'Internal Server Error'
        });
    }
}; 