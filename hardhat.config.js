require('@nomicfoundation/hardhat-toolbox')

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
	solidity: {
		version: '0.8.10',
		settings: {
			optimizer: {
				enabled: true,
				runs: 99999,
			},
		},
	},

	networks: {
		ethereum: {
			url: process.env.ETHEREUM_URL || '',
			accounts:
				process.env.PRIVATE_KEY !== undefined
					? [process.env.PRIVATE_KEY]
					: [],
		},

		sepolia: {
			url: process.env.SEPOLIA_URL || '',
			accounts:
				process.env.PRIVATE_KEY !== undefined
					? [process.env.PRIVATE_KEY]
					: [],
		},
	},

	gasReporter: {
		enabled: process.env.REPORT_GAS !== undefined,
		currency: 'USD',
	},

	etherscan: {
		apiKey: process.env.ETHERSCAN_API_KEY,
	},
}
