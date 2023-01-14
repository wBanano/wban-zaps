const config: Record<string, ZapConfig> = {
	bsc: {
		router: "", // TODO:
		pair: "", // TODO:
		weth: "", // TODO:
	},
	polygon: {
		router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
		pair: "0xb556feD3B348634a9A010374C406824Ae93F0CF8",
		weth: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
	},
	fantom: {
		router: "0xF491e7B69E4244ad4002BC14e878a34207E38c29",
		pair: "0x6bADcf8184a760326528b11057C00952811f77af",
		weth: "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83",
	},
	ethereum: {
		router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // TODO: check
		pair: "0x1f249F8b5a42aa78cc8a2b66EE0bb015468a5f43", // TODO: check
		weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // TODO: check
	},
	arbitrum: {
		router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
		pair: "", // TODO:
		weth: "", // TODO:
	},
}

type ZapConfig = {
	router: string
	pair: string
	weth: string
}

export { config, ZapConfig }
