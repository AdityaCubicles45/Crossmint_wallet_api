const config = {
    development: {
        apiUrl: 'https://staging.crossmint.com/api/2022-06-09',
        chain: 'polygon-amoy',
        chainId: 80002, // Polygon Amoy testnet
        rpcUrl: 'https://rpc-amoy.polygon.technology',
        tokenContracts: {
            WMATIC: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889'
        }
    },
    production: {
        apiUrl: 'https://www.crossmint.com/api/2022-06-09',
        chain: 'polygon',
        chainId: 137, // Polygon mainnet
        rpcUrl: 'https://polygon-rpc.com',
        tokenContracts: {
            WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
        }
    }
};

const environment = process.env.NODE_ENV || 'development';
module.exports = config[environment]; 