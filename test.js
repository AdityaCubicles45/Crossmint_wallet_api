const axios = require('axios');
require('dotenv').config({ path: '.env.dev' });

const API_BASE_URL = 'https://aclimcvtwg.execute-api.ap-south-1.amazonaws.com/dev';

async function testKeyManager() {
    try {
        console.log('Starting Key Manager Tests...\n');

        // Log environment variables
        console.log('Environment variables:');
        console.log('ADMIN_WALLET_ADDRESS:', process.env.ADMIN_WALLET_ADDRESS);
        console.log('API_KEY:', process.env.API_KEY);
        
        const apiKey = process.env.API_KEY;
        console.log('\nUsing API Key:', apiKey ? 'Present' : 'Missing');
        console.log('API Key length:', apiKey?.length || 0);
        
        if (!apiKey) {
            throw new Error('API key is missing. Please set it in your .env.dev file.');
        }

        const headers = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        };

        // Test 1: Create Wallet
        console.log('\nTest 1: Creating wallet...');
        const createWalletPayload = {
            adminWalletAddress: process.env.ADMIN_WALLET_ADDRESS
        };
        console.log('Create wallet payload:', JSON.stringify(createWalletPayload, null, 2));
        
        const createWalletResponse = await axios.post(
            `${API_BASE_URL}/wallet`,
            createWalletPayload,
            { headers }
        );
        console.log('Create wallet response:', JSON.stringify(createWalletResponse.data, null, 2));
        
        if (!createWalletResponse.data.success) {
            throw new Error('Failed to create wallet');
        }

        const { address: walletAddress } = createWalletResponse.data.wallet;
        const { address: delegatedKeyAddress } = createWalletResponse.data.delegatedKey;
        console.log('✓ Test 1 passed: Wallet created and delegated key stored automatically\n');

        // Test 2: Retrieve Delegated Key
        console.log('Test 2: Retrieving delegated key...');
        const retrievePayload = {
            action: 'getDelegatedKey',
            address: delegatedKeyAddress
        };
        console.log('Retrieve payload:', JSON.stringify(retrievePayload, null, 2));
        
        const retrieveResponse = await axios.post(
            `${API_BASE_URL}/keys`,
            retrievePayload,
            { headers }
        );
        console.log('Retrieve response:', JSON.stringify(retrieveResponse.data, null, 2));

        if (!retrieveResponse.data.success) {
            throw new Error('Failed to retrieve delegated key');
        }

        // Verify retrieved key matches original (if you have the original in env)
        if (process.env.DELEGATED_KEY_PRIVATE_KEY && retrieveResponse.data.delegatedKeyPrivateKey !== process.env.DELEGATED_KEY_PRIVATE_KEY) {
            throw new Error('Retrieved key does not match original key');
        }
        console.log('✓ Test 2 passed: Delegated key retrieved and verified successfully\n');

        console.log('All tests passed successfully! 🎉');
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        process.exit(1);
    }
}

testKeyManager(); 