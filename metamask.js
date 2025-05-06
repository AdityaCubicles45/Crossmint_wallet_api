const { ethers } = require('ethers');
const config = require('./config');

class MetaMaskService {
    constructor() {
        this.provider = null;
        this.signer = null;
    }

    async connect() {
        if (typeof window.ethereum === 'undefined') {
            throw new Error('MetaMask is not installed');
        }

        try {
            // Request account access
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            
            // Create provider and signer
            this.provider = new ethers.providers.Web3Provider(window.ethereum);
            this.signer = this.provider.getSigner();

            // Check if we're on the correct network
            const network = await this.provider.getNetwork();
            if (network.chainId !== config.chainId) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: `0x${config.chainId.toString(16)}` }],
                    });
                } catch (switchError) {
                    // If the network is not added to MetaMask, add it
                    if (switchError.code === 4902) {
                        await window.ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: `0x${config.chainId.toString(16)}`,
                                chainName: config.chain === 'polygon' ? 'Polygon Mainnet' : 'Polygon Amoy Testnet',
                                nativeCurrency: {
                                    name: 'MATIC',
                                    symbol: 'MATIC',
                                    decimals: 18
                                },
                                rpcUrls: [config.rpcUrl],
                                blockExplorerUrls: [
                                    config.chain === 'polygon' 
                                        ? 'https://polygonscan.com'
                                        : 'https://www.oklink.com/amoy'
                                ]
                            }]
                        });
                    } else {
                        throw switchError;
                    }
                }
            }

            return await this.signer.getAddress();
        } catch (error) {
            console.error('Error connecting to MetaMask:', error);
            throw error;
        }
    }

    async signMessage(message) {
        if (!this.signer) {
            throw new Error('MetaMask not connected');
        }
        return await this.signer.signMessage(message);
    }

    async getBalance(address) {
        if (!this.provider) {
            throw new Error('MetaMask not connected');
        }
        return await this.provider.getBalance(address);
    }

    async getTokenBalance(tokenAddress, address) {
        if (!this.provider) {
            throw new Error('MetaMask not connected');
        }

        const tokenContract = new ethers.Contract(
            tokenAddress,
            ['function balanceOf(address) view returns (uint256)'],
            this.provider
        );

        return await tokenContract.balanceOf(address);
    }
}

module.exports = new MetaMaskService(); 