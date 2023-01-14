import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { config, ZapConfig } from "../src/config"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
	const {
		deployments: { deploy },
	} = hre
	const [deployer] = await hre.ethers.getSigners()
	const zapConfig: ZapConfig = config[hre.network.name]

	let zap = await deploy("WBANFarmZap", {
		from: deployer.address,
		args: [zapConfig.router, zapConfig.pair, zapConfig.weth],
		log: true,
	})
}

export default func
func.tags = ["WBANFarmZap"]
