import { ethers } from "hardhat"
import chai from "chai"
import {
	WBANFarmZap,
	WBANFarmZap__factory,
	IUniswapV2Pair,
	IUniswapV2Pair__factory,
	IERC20,
	IERC20__factory,
	IERC20Permit__factory,
} from "../artifacts/typechain"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { resetForkedChain, makeForkedChainSnapshot } from "./utils/forking"
import { formatEther, parseEther, parseUnits } from "ethers/lib/utils"
import PermitUtil from "./utils/PermitUtils"
import { Signature } from "ethers"

const { expect } = chai

describe("WBANFarmZap", () => {
	let zap: WBANFarmZap
	let owner: SignerWithAddress
	let user: SignerWithAddress
	let pair: IUniswapV2Pair
	let wban: IERC20
	let weth: IERC20
	let usdc: IERC20

	beforeEach(async () => {
		await resetForkedChain()
		await makeForkedChainSnapshot()

		const signers = await ethers.getSigners()
		owner = signers[0]
		user = signers[1]

		pair = IUniswapV2Pair__factory.connect("0x1f249F8b5a42aa78cc8a2b66EE0bb015468a5f43", owner)
		wban = IERC20__factory.connect("0xe20B9e246db5a0d21BF9209E4858Bc9A3ff7A034", owner)

		const ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
		const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
		const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
		weth = IERC20__factory.connect(WETH, owner)
		usdc = IERC20__factory.connect(USDC, owner)

		// deploy Zap contract
		const WBANFarmZap = (await ethers.getContractFactory("WBANFarmZap", signers[0])) as WBANFarmZap__factory
		zap = (await WBANFarmZap.deploy(ROUTER, pair.address, WETH)) as WBANFarmZap
		await zap.deployed()
		expect(zap.address).to.properAddress

		// impersonate a user having a good stash of wBAN
		const impersonatedUser = await ethers.getImpersonatedSigner("0xFda1A08767c896Ea5545A91c6259eb670D603A51")
		expect(await wban.balanceOf(impersonatedUser.address)).to.be.above("191919")
		// transfer wBAN, USDC & ETH to `user`
		await wban.connect(impersonatedUser).transfer(user.address, parseEther("191919"))
		await usdc.connect(impersonatedUser).transfer(user.address, parseUnits("77777", 6))
		await impersonatedUser.sendTransaction({ to: user.address, value: parseEther("0.14") })
	})

	describe("Zap in", () => {
		it("should add liquidity from wBAN", async () => {
			const amount = parseEther("77777").mul(2)
			const minExpectedEth = parseEther("0.29")
			expect(await wban.balanceOf(user.address)).to.be.greaterThanOrEqual(amount)
			await wban.connect(user).approve(zap.address, amount)
			// user zaps in from wBAN
			await zap.connect(user).zapInFromToken(wban.address, amount, minExpectedEth, { gasLimit: 500_000 })
			// user should have LP tokens
			const bal = await pair.balanceOf(user.address)
			expect(await pair.balanceOf(user.address)).to.be.above(0)
			// LP amount should match deposit
			const reserves = await pair.getReserves()
			const pairSupply = await pair.totalSupply()
			const amountA = reserves[0].mul(bal).div(pairSupply)
			const amountB = reserves[1].mul(bal).div(pairSupply)
			expect(amountA).to.be.greaterThanOrEqual(minExpectedEth)
			expect(amountA).to.be.closeTo(minExpectedEth, parseEther("0.015"))
			expect(amountB).to.be.closeTo(amount.div(2), parseEther("600"))
			// zap contract shouldn't have any token left
			expect(await wban.balanceOf(zap.address)).to.equal(0)
			expect(await pair.balanceOf(zap.address)).to.equal(0)
		})

		it("should add liquidity from wBAN with permit", async () => {
			const amount = parseEther("77777").mul(2)
			const minExpectedEth = parseEther("0.28")
			expect(await wban.balanceOf(user.address)).to.be.greaterThanOrEqual(amount)
			// use permit feature
			const deadline = Date.now() + 30 * 60 * 1_000 // deadline of 30 minutes
			const sig: Signature = await PermitUtil.createPermitSignature(
				IERC20Permit__factory.connect(wban.address, owner),
				user,
				zap.address,
				amount,
				deadline
			)
			// user zaps in from wBAN
			await zap
				.connect(user)
				.zapInFromTokenWithPermit(wban.address, amount, minExpectedEth, deadline, sig.v, sig.r, sig.s, {
					gasLimit: 500_000,
				})
			// user should have LP tokens
			const bal = await pair.balanceOf(user.address)
			expect(await pair.balanceOf(user.address)).to.be.above(0)
			// LP amount should match deposit
			const reserves = await pair.getReserves()
			const pairSupply = await pair.totalSupply()
			const amountA = reserves[0].mul(bal).div(pairSupply)
			const amountB = reserves[1].mul(bal).div(pairSupply)
			expect(amountA).to.be.greaterThanOrEqual(minExpectedEth)
			expect(amountA).to.be.closeTo(minExpectedEth, parseEther("0.015"))
			expect(amountB).to.be.closeTo(amount.div(2), parseEther("600"))
			// zap contract shouldn't have any token left
			expect(await wban.balanceOf(zap.address)).to.equal(0)
			expect(await pair.balanceOf(zap.address)).to.equal(0)
		})

		it("should add liquidity from ETH", async () => {
			const amount = parseEther("0.069").mul(2)
			const minExpectedWBAN = parseEther("17800")
			// user zaps in from ETH
			const initialBalance = await user.getBalance()
			const receipt = await zap.connect(user).zapInFromETH(minExpectedWBAN, { value: amount, gasLimit: 500_000 })
			const tx = await receipt.wait()
			const txFee = tx.gasUsed.mul(receipt.gasPrice!)
			// user should have LP tokens
			const bal = await pair.balanceOf(user.address)
			expect(await pair.balanceOf(user.address)).to.be.closeTo(parseEther("35.05"), parseEther("0.1"))
			// LP amount should match deposit
			const reserves = await pair.getReserves()
			const pairSupply = await pair.totalSupply()
			const amountA = reserves[0].mul(bal).div(pairSupply)
			const amountB = reserves[1].mul(bal).div(pairSupply)
			expect(amountB).to.be.greaterThanOrEqual(minExpectedWBAN)
			expect(amountB).to.be.closeTo(minExpectedWBAN, parseEther("100"))
			expect(amountA).to.be.closeTo(amount.div(2), parseEther("600"))
			// user should get back some dust ETH
			expect(await user.getBalance()).to.be.greaterThan(initialBalance.sub(amount).sub(txFee))
			// zap contract shouldn't have any token left
			expect(await wban.balanceOf(zap.address)).to.equal(0)
			expect(await pair.balanceOf(zap.address)).to.equal(0)
		})

		it("should reject add liquidity from wBAN if not upfront approval", async () => {
			const amount = parseEther("77777").mul(2)
			const minExpectedEth = parseEther("0.28")
			expect(await wban.balanceOf(user.address)).to.be.greaterThanOrEqual(amount)
			// user zaps in from wBAN
			await expect(
				zap.connect(user).zapInFromToken(wban.address, amount, minExpectedEth, { gasLimit: 500_000 })
			).to.be.revertedWith("Input token is not approved")
		})

		it("should reject add liquidity from USDC (not included in pair)", async () => {
			const amount = parseUnits("420", 6).mul(2)
			const minExpectedEth = parseEther("0.3")
			await usdc.connect(user).approve(zap.address, amount)
			expect(await usdc.balanceOf(user.address)).to.be.greaterThanOrEqual(amount)
			// user zaps in from wBAN
			await expect(
				zap.connect(user).zapInFromToken(usdc.address, amount, minExpectedEth, { gasLimit: 500_000 })
			).to.be.revertedWith("Zap: input token not present in liquidity pair")
		})
	})

	describe("Zap out", () => {
		it("should remove liquidity to wBAN", async () => {
			const amount = parseEther("77777").mul(2)
			const minExpectedEth = parseEther("0.28")
			expect(await wban.balanceOf(user.address)).to.be.greaterThanOrEqual(amount)
			// user zaps in from wBAN
			const initialBalance = await wban.balanceOf(user.address)
			await wban.connect(user).approve(zap.address, amount)
			await zap.connect(user).zapInFromToken(wban.address, amount, minExpectedEth, { gasLimit: 500_000 })
			const lpAmount = await pair.balanceOf(user.address)
			// user zaps out to wBAN
			await pair.connect(user).approve(zap.address, ethers.constants.MaxUint256)
			await zap.connect(user).zapOutToToken(lpAmount, wban.address, amount.div(2).sub(parseEther("10000")))
			expect(await wban.balanceOf(user.address)).to.be.closeTo(initialBalance, parseEther("500"))
			// zap contract shouldn't have any token left
			expect(await wban.balanceOf(zap.address)).to.equal(0)
			expect(await pair.balanceOf(zap.address)).to.equal(0)
		})

		it("should remove liquidity to wBAN with permit", async () => {
			const amount = parseEther("77777").mul(2)
			const minExpectedEth = parseEther("0.28")
			expect(await wban.balanceOf(user.address)).to.be.greaterThanOrEqual(amount)
			// user zaps in from wBAN
			const initialBalance = await wban.balanceOf(user.address)
			await wban.connect(user).approve(zap.address, amount)
			await zap.connect(user).zapInFromToken(wban.address, amount, minExpectedEth, { gasLimit: 500_000 })
			const lpAmount = await pair.balanceOf(user.address)
			// user zaps out to wBAN using permit
			const deadline = Date.now() + 30 * 60 * 1_000 // deadline of 30 minutes
			const nonce = await pair.nonces(user.address)
			const sig: Signature = await PermitUtil.createPermitSignatureForToken(
				await pair.name(),
				"1",
				pair.address,
				user,
				zap.address,
				lpAmount,
				nonce,
				deadline,
				1
			)
			await zap
				.connect(user)
				.zapOutToTokenWithPermit(
					lpAmount,
					wban.address,
					amount.div(2).sub(parseEther("10000")),
					deadline,
					sig.v,
					sig.r,
					sig.s
				)
			expect(await wban.balanceOf(user.address)).to.be.closeTo(initialBalance, parseEther("500"))
			// zap contract shouldn't have any token left
			expect(await wban.balanceOf(zap.address)).to.equal(0)
			expect(await pair.balanceOf(zap.address)).to.equal(0)
		})

		it("should remove liquidity to ETH with permit", async () => {
			const amount = parseEther("0.069").mul(2)
			const minExpectedWBAN = parseEther("17800")
			// user zaps in from ETH
			await zap.connect(user).zapInFromETH(minExpectedWBAN, { value: amount, gasLimit: 500_000 })
			const lpAmount = await pair.balanceOf(user.address)
			// user zaps out to wBAN using permit
			const initialBalance = await user.getBalance()
			const deadline = Date.now() + 30 * 60 * 1_000 // deadline of 30 minutes
			const nonce = await pair.nonces(user.address)
			const sig: Signature = await PermitUtil.createPermitSignatureForToken(
				await pair.name(),
				"1",
				pair.address,
				user,
				zap.address,
				lpAmount,
				nonce,
				deadline,
				1
			)
			const receipt = await zap
				.connect(user)
				.zapOutToTokenWithPermit(
					lpAmount,
					weth.address,
					amount.div(2).sub(parseEther("0.001")),
					deadline,
					sig.v,
					sig.r,
					sig.s
				)
			const tx = await receipt.wait()
			const txFee = tx.gasUsed.mul(receipt.gasPrice!)
			expect(await user.getBalance()).to.be.closeTo(initialBalance.sub(txFee).add(amount), parseEther("0.0005"))
			// zap contract shouldn't have any token left
			expect(await wban.balanceOf(zap.address)).to.equal(0)
			expect(await pair.balanceOf(zap.address)).to.equal(0)
			// user shouldn't have some WETH
			expect(await weth.balanceOf(user.address)).to.equal(0)
		})
	})

	describe("Swap Estimates", () => {
		it("should estimate ETH amount from wBAN", async () => {
			const amount = parseEther("77777").mul(2)
			const minExpectedEth = parseEther("0.29")
			const [swapAmountIn, swapAmountOut, swapTokenOut] = await zap.estimateSwap(wban.address, amount)
			expect(swapAmountIn).to.be.closeTo(amount.div(2), parseEther("600"))
			expect(swapTokenOut).to.eq(weth.address)
			expect(swapAmountOut).to.be.above(minExpectedEth)
			expect(swapAmountOut).to.be.closeTo(minExpectedEth, parseEther("0.0002"))
		})

		it("should estimate wBAN amount from ETH", async () => {
			const amount = parseEther("0.069").mul(2)
			const minExpectedWBAN = parseEther("17800")
			const [swapAmountIn, swapAmountOut, swapTokenOut] = await zap.estimateSwap(weth.address, amount)
			expect(swapAmountIn).to.be.closeTo(amount.div(2), parseEther("0.0001"))
			expect(swapTokenOut).to.eq(wban.address)
			expect(swapAmountOut).to.be.above(minExpectedWBAN)
			expect(swapAmountOut).to.be.closeTo(minExpectedWBAN, parseEther("500"))
		})
	})
})
