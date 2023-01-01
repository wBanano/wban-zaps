import { IERC20Permit } from "@artifacts/typechain"
import { ethers, providers, BigNumber, BigNumberish, Signature } from "ethers"
import { TypedDataDomain, TypedDataField } from "@ethersproject/abstract-signer"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

class PermitUtil {
	static async createPermitSignature(
		wban: IERC20Permit,
		owner: SignerWithAddress,
		spender: string,
		value: BigNumberish,
		deadline: BigNumberish
	): Promise<Signature> {
		const nonce = await wban.nonces(await owner.getAddress())
		const sig = await PermitUtil.createPermitSignatureForToken(
			"Wrapped Banano",
			"1",
			wban.address,
			owner,
			spender,
			value,
			nonce,
			deadline,
			await owner.getChainId()
		)
		return sig
	}

	static async createPermitSignatureForToken(
		name: string,
		version: string,
		verifyingContract: string,
		owner: SignerWithAddress,
		spender: string,
		value: BigNumberish,
		nonce: BigNumber,
		deadline: BigNumberish,
		chainId: number,
	): Promise<Signature> {
		const domain: TypedDataDomain = { name, version, chainId, verifyingContract }
		const types: Record<string, Array<TypedDataField>> = {
			Permit: [
				{ name: "owner", type: "address" },
				{ name: "spender", type: "address" },
				{ name: "value", type: "uint256" },
				{ name: "nonce", type: "uint256" },
				{ name: "deadline", type: "uint256" },
			],
		}
		const message = {
			owner: await owner.getAddress(),
			spender,
			value,
			nonce: nonce.toHexString(),
			deadline,
		}
		const signature = await owner._signTypedData(domain, types, message)
		const sig: Signature = ethers.utils.splitSignature(signature)
		return sig
	}
}

export default PermitUtil
