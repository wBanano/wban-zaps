import 'dotenv/config';
import { task, types } from "hardhat/config";
import { HardhatUserConfig } from "hardhat/types";
import "@nomicfoundation/hardhat-chai-matchers";
import '@typechain/hardhat';
import 'hardhat-dependency-compiler';
import "hardhat-spdx-license-identifier";
import "hardhat-preprocessor";
import { removeConsoleLog } from 'hardhat-preprocessor';
import "hardhat-log-remover";
import "solidity-coverage";
import "@nomiclabs/hardhat-solhint";
import "hardhat-contract-sizer";
// import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-abi-exporter";
import "hardhat-deploy";

let mnemonic = process.env.MNEMONIC;
if (!mnemonic) {
  // FOR DEV ONLY, SET IT IN .env files if you want to keep it private
  // (IT IS IMPORTANT TO HAVE A NON RANDOM MNEMONIC SO THAT SCRIPTS CAN ACT ON THE SAME ACCOUNTS)
  mnemonic = 'test test test test test test test test test test test junk';
}
const accounts = { mnemonic };

task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();
  for (const account of accounts) {
    console.log(await account.address);
  }
});

const config: HardhatUserConfig = {
	solidity: {
		compilers: [
			{
				version: "0.8.17",
				settings: {
					metadata: {
						bytecodeHash: "none"
					},
					optimizer: {
						enabled: true,
						runs: 2000
					},
					outputSelection: {
						"*": {
							"*": ["metadata"]
						}
					}
				},
			},
		]
	},
  networks: {
		hardhat: {
			forking: {
				url: 'https://eth.llamarpc.com',
				blockNumber: 16305915,
			},
			// url: "http://127.0.0.1:8545/",
		},
		bsc: {
			url: 'https://bsc-dataseed.binance.org/',
			accounts,
			chainId: 56,
		},
		polygon: {
			url: 'https://polygon-rpc.com',
			accounts,
			chainId: 137,
			gasMultiplier: 1.1,
		},
		fantom: {
			url: 'https://rpc.ftm.tools',
			accounts,
			chainId: 250,
			gasMultiplier: 1.4,
			//gasPrice: 4000000000000,
		},
		ethereum: {
			url: "https://rpc.ankr.com/eth",
			accounts,
			chainId: 1,
			timeout: 600_000, // 10 minutes
			// gasMultiplier: 1.1,
			gasPrice: 14_000_000_000,
		},
		arbitrum: {
			url: 'https://arb1.arbitrum.io/rpc',
			accounts,
			chainId: 42161,
			gasMultiplier: 1.1,
		},
	},
	mocha: {
		timeout: 120_000
	},
	typechain: {
		outDir: 'artifacts/typechain',
		target: 'ethers-v5',
	},
	spdxLicenseIdentifier: {
		overwrite: true,
		runOnCompile: true,
	},
	/*
	dependencyCompiler: {
		paths: [
			//'@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol',
			//'@uniswap/v2-core/contracts/UniswapV2Factory.sol',
			'@uniswap/v2-core/contracts/UniswapV2Pair.sol',
			//'@uniswap/v2-core/contracts/test/ERC20.sol',
			//'@uniswap/v2-periphery/contracts/test/WETH9.sol',
		],
 	},
	*/
	preprocess: {
		eachLine: removeConsoleLog((bre) => bre.network.name !== 'hardhat' && bre.network.name !== 'localhost'),
	},
	/*
	gasReporter: {
		currency: 'EUR',
		gasPrice: 20, // in gwei
		// coinmarketcap: ,
	},
	*/
	etherscan: {
		// Your API key for Etherscan
		// Obtain one at https://etherscan.io/
		apiKey: process.env.ETHERSCAN_API_KEY
	}
};

export default config;
