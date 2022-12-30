import { ethers } from "hardhat"
import * as rlp from "rlp"
import keccak from "keccak"

export const predictAddresses = async ({ creator }: { creator: string }) => {
	creator = creator || "0x565EB5e5B21F97AE9200D121e77d2760FFf106cb"

	let currentNonce = await ethers.getDefaultProvider().getTransactionCount(creator)
	let currentNonceHex = `0x${currentNonce.toString(16)}`
	let currentInputArr = [creator, currentNonceHex]
	let currentRlpEncoded = rlp.encode(currentInputArr)
	let currentContractAddressLong = keccak("keccak256").update(currentRlpEncoded).digest("hex")
	let currentContractAddress = `0x${currentContractAddressLong.substring(24)}`
	let currentContractAddressChecksum = ethers.utils.getAddress(currentContractAddress)

	let nextNonce = currentNonce + 1
	let nextNonceHex = `0x${nextNonce.toString(16)}`
	let nextInputArr = [creator, nextNonceHex]
	let nextRlpEncoded = rlp.encode(nextInputArr)
	let nextContractAddressLong = keccak("keccak256").update(nextRlpEncoded).digest("hex")
	let nextContractAddress = `0x${nextContractAddressLong.substring(24)}`
	let nextContractAddressChecksum = ethers.utils.getAddress(nextContractAddress)

	return {
		vault: currentContractAddressChecksum,
		strategy: nextContractAddressChecksum,
	}
}
