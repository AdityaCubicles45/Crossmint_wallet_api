require('dotenv').config();
const axios = require('axios');
const { ethers } = require('ethers');
const config = require('./config');
const metamask = require('./metamask');
const { handler: keyManagerHandler } = require('./key-manager');

// Axios instance with default config
const axiosInstance = axios.create({
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CROSSMINT_API_KEY
    }
});

// Helper function to get delegated key
async function getDelegatedKey() {
    try {
        const result = await keyManagerHandler({ action: 'getDelegatedKey' });
        if (!result.success && result.error) {
            throw new Error(result.error);
        }
        return result.delegatedKeyPrivateKey;
    } catch (error) {
        console.error('Error getting delegated key:', error);
        throw error;
    }
}

// Retry mechanism
const retryRequest = async (fn, retries = 3, delay = 1000) => {
    try {
        return await fn();
    } catch (error) {
        if (retries === 0) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
        return retryRequest(fn, retries - 1, delay * 2);
    }
};

// Validation functions
const validateEnvironment = () => {
    const requiredEnvVars = ['ADMIN_WALLET_ADDRESS', 'CROSSMINT_API_KEY'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
};

const validateWalletAddress = (address) => {
    return address && /^0x[a-fA-F0-9]{40}$/.test(address);
};

// API request functions
const createWalletRequest = async (adminAddress) => {
    const response = await axiosInstance.post(`${config.apiUrl}/wallets`, {
        type: 'evm-smart-wallet',
        config: {
            adminSigner: {
                type: 'evm-keypair',
                address: adminAddress
            }
        }
    });

    return response.data;
};

const registerDelegatedKey = async (walletAddress, adminAddress) => {
    const response = await axiosInstance.post(
        `${config.apiUrl}/wallets/${walletAddress}/signers`,
        {
            signer: `evm-keypair:${adminAddress}`,
            chain: config.chain
        }
    );

    return response.data;
};

// Response helper
const createResponse = (statusCode, data) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(data)
});

const createWallet = async (event) => {
    try {
        validateEnvironment();
        
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        console.log('Request body:', body);
        
        // Use admin wallet address from request or environment
        const adminWalletAddress = body.adminWalletAddress || process.env.ADMIN_WALLET_ADDRESS;
        validateWalletAddress(adminWalletAddress);
        
        console.log('Admin wallet address:', adminWalletAddress);

        const wallet = await createWalletRequest(adminWalletAddress);
        console.log('Wallet created:', wallet);

        const delegatedKey = await registerDelegatedKey(
            wallet.address,
            adminWalletAddress
        );
        console.log('Delegated key registered:', delegatedKey);

        return createResponse(200, {
            success: true,
            wallet,
            delegatedKey
        });
    } catch (error) {
        console.error('Error creating wallet:', error);
        return createResponse(500, {
            success: false,
            error: error.message
        });
    }
};

const transferAbi = [{
    inputs: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" }
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
}];

async function signAndSubmitTransaction(transaction) {
    const walletAddress = process.env.WALLET_ADDRESS;
    const adminWalletAddress = process.env.ADMIN_WALLET_ADDRESS;

    console.log("Wallet Address:", walletAddress);
    console.log("Admin Wallet Address:", adminWalletAddress);
    console.log("Transaction:", transaction);

    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000;

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (let retries = 0; retries < MAX_RETRIES; retries++) {
        try {
            const response = await axiosInstance.post(
                `${config.apiUrl}/wallets/${walletAddress}/transactions`,
                {
                    params: {
                        chain: config.chain,
                        calls: [{
                            address: transaction.to,
                            value: transaction.value,
                            data: transaction.data,
                            functionName: "transfer",
                            abi: transferAbi,
                            args: [transaction.to, transaction.value]
                        }],
                        signer: `evm-keypair:${adminWalletAddress}`
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.log(`Attempt ${retries + 1} failed: ${error.message}`);
            if (error.response) {
                console.log("Response data:", error.response.data);
                console.log("Response status:", error.response.status);
            }

            if (retries === MAX_RETRIES - 1) {
                throw error;
            }

            await sleep(RETRY_DELAY * Math.pow(2, retries));
        }
    }
}

async function approveTransaction(transactionId) {
    const walletAddress = process.env.WALLET_ADDRESS;
    const adminWalletAddress = process.env.ADMIN_WALLET_ADDRESS;

    console.log('Wallet Address:', walletAddress);
    console.log('Admin Wallet Address:', adminWalletAddress);
    console.log('Transaction ID:', transactionId);

    try {
        // Get transaction details
        const transactionResponse = await axiosInstance.get(
            `${config.apiUrl}/wallets/${walletAddress}/transactions/${transactionId}`
        );

        const transaction = transactionResponse.data;
        console.log('Transaction details:', JSON.stringify(transaction, null, 2));

        // Get the message to sign
        const messageToSign = transaction.onChain.userOperationHash;
        console.log('Message to sign:', messageToSign);

        // Sign the message with MetaMask
        const signature = await metamask.signMessage(messageToSign);
        console.log('Generated signature:', signature);

        // Submit the approval
        const approvalResponse = await axiosInstance.post(
            `${config.apiUrl}/wallets/${walletAddress}/transactions/${transactionId}/approvals`,
            {
                approvals: [
                    {
                        signer: `evm-keypair:${adminWalletAddress}`,
                        signature: signature,
                    },
                ],
            }
        );

        return approvalResponse.data;
    } catch (error) {
        console.error('Error approving transaction:', error);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
        }
        throw error;
    }
}

async function submitTransactionToBlockchain(transactionId) {
    const walletAddress = process.env.WALLET_ADDRESS;

    try {
        // Get transaction details
        const transactionResponse = await axiosInstance.get(
            `${config.apiUrl}/wallets/${walletAddress}/transactions/${transactionId}`
        );

        const transaction = transactionResponse.data;
        console.log('Transaction details:', JSON.stringify(transaction, null, 2));

        // Submit the transaction to the blockchain
        const submitResponse = await axiosInstance.post(
            `${config.apiUrl}/wallets/${walletAddress}/transactions/${transactionId}/submit`
        );

        console.log('Transaction submitted to blockchain:', JSON.stringify(submitResponse.data, null, 2));
        return submitResponse.data;
    } catch (error) {
        console.error('Error submitting transaction to blockchain:', error);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
        }
        throw error;
    }
}

async function signTransaction(event) {
    try {
        console.log('Signing transaction...');
        const body = JSON.parse(event.body);
        const { transactionId, walletAddress } = body;

        if (!transactionId || !walletAddress) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: 'Missing required parameters'
                })
            };
        }

        // Validate wallet address format
        if (!validateWalletAddress(walletAddress)) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid wallet address format'
                })
            };
        }

        // Get transaction details from Crossmint API
        const transactionResponse = await axiosInstance.get(`${config.apiUrl}/wallets/${walletAddress}/transactions/${transactionId}`);
        console.log('Transaction details:', transactionResponse.data);

        // Sign the transaction message with MetaMask
        const signature = await metamask.signMessage(transactionResponse.data.message);
        console.log('Transaction signed:', signature);

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                signature,
                transaction: transactionResponse.data
            })
        };
    } catch (error) {
        console.error('Error signing transaction:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
}

async function createTransaction(event) {
    try {
        console.log('Creating transaction...');
        const body = JSON.parse(event.body);
        const { walletAddress, to, value, data } = body;

        if (!walletAddress || !to || !value) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: 'Missing required parameters'
                })
            };
        }

        // Validate wallet addresses
        if (!validateWalletAddress(walletAddress) || !validateWalletAddress(to)) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid wallet address format'
                })
            };
        }

        // Create transaction using Crossmint API
        const transactionResponse = await axiosInstance.post(`${config.apiUrl}/wallets/${walletAddress}/transactions`, {
            params: {
                chain: config.chain,
                calls: [{
                    address: to,
                    value,
                    data: data || '0x'
                }],
                signer: `evm-keypair:${process.env.ADMIN_WALLET_ADDRESS}`
            }
        });

        console.log('Transaction created:', transactionResponse.data);

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                transaction: transactionResponse.data
            })
        };
    } catch (error) {
        console.error('Error creating transaction:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
}

async function storeDelegatedKey(event) {
    try {
        console.log('Storing delegated key...');
        console.log('Event:', JSON.stringify(event, null, 2));
        
        const body = JSON.parse(event.body);
        console.log('Body:', JSON.stringify(body, null, 2));
        
        const { delegatedKeyPrivateKey, delegatedKeyAddress } = body;

        if (!delegatedKeyPrivateKey || !delegatedKeyAddress) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: 'Missing required parameters: delegatedKeyPrivateKey or delegatedKeyAddress'
                })
            };
        }

        // Validate delegated key address format
        if (!validateWalletAddress(delegatedKeyAddress)) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid delegated key address format'
                })
            };
        }

        // Store the delegated key using key manager
        const result = await keyManagerHandler({
            action: 'storeDelegatedKey',
            delegatedKeyPrivateKey,
            delegatedKeyAddress
        });

        if (!result.success) {
            throw new Error(result.error || 'Failed to store delegated key');
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: 'Delegated key stored successfully',
                delegatedKeyAddress: result.delegatedKeyAddress
            })
        };
    } catch (error) {
        console.error('Error storing delegated key:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: error.message || 'Internal server error'
            })
        };
    }
}

module.exports = { 
    createWallet,
    createTransaction,
    signTransaction,
    signAndSubmitTransaction,
    approveTransaction,
    submitTransactionToBlockchain,
    storeDelegatedKey
}; 