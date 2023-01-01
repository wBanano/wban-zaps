// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IWETH.sol";
import "@uniswap/lib/contracts/libraries/Babylonian.sol";

/**
 * Zap in/out contract for wBAN farms
 *
 * @dev inspired by Beefy contract https://github.com/beefyfinance/beefy-contracts/blob/master/contracts/BIFI/zaps/BeefyZapUniswapV2.txt
 */
contract WBANFarmZap is Ownable, Pausable {
    using SafeERC20 for IERC20;

    IUniswapV2Router02 public immutable router;
    IUniswapV2Pair public immutable pair;
    address public immutable WETH;

    constructor(
        IUniswapV2Router02 _router,
        IUniswapV2Pair _pair,
        address _WETH
    ) {
        // safety checks to ensure WETH token address
        IWETH(_WETH).deposit{value: 0}();
        IWETH(_WETH).withdraw(0);

        router = _router;
        pair = _pair;
        WETH = _WETH;
    }

    receive() external payable {
        assert(msg.sender == WETH);
    }

    function zapInFromToken(
        IERC20 tokenIn,
        uint256 tokenInAmount,
        uint256 tokenAmountOutMin
    ) external {
        require(IERC20(tokenIn).allowance(msg.sender, address(this)) >= tokenInAmount, "Input token is not approved");
        tokenIn.safeTransferFrom(msg.sender, address(this), tokenInAmount);
        _swapAndAddLiquidity(address(tokenIn), tokenAmountOutMin);
    }

    function zapInFromTokenWithPermit(
        IERC20 tokenIn,
        uint256 tokenInAmount,
        uint256 tokenAmountOutMin,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        IERC20Permit(address(tokenIn)).permit(msg.sender, address(this), tokenInAmount, deadline, v, r, s);
        tokenIn.safeTransferFrom(msg.sender, address(this), tokenInAmount);
        _swapAndAddLiquidity(address(tokenIn), tokenAmountOutMin);
    }

    function zapInFromETH(uint256 tokenAmountOutMin) external payable {
        IWETH(WETH).deposit{value: msg.value}();
        _swapAndAddLiquidity(WETH, tokenAmountOutMin);
    }

    function zapOutToTokenWithPermit(
        uint256 withdrawAmount,
        address desiredToken,
        uint256 desiredTokenOutMin,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        IERC20Permit(address(pair)).permit(msg.sender, address(this), withdrawAmount, deadline, v, r, s);
        zapOutToToken(withdrawAmount, desiredToken, desiredTokenOutMin);
    }

    function zapOutToToken(
        uint256 withdrawAmount,
        address desiredToken,
        uint256 desiredTokenOutMin
    ) public {
        address token0 = pair.token0();
        address token1 = pair.token1();
        require(token0 == desiredToken || token1 == desiredToken, "Zap: desired token not present in liquidity pair");

        IERC20(address(pair)).safeTransferFrom(msg.sender, address(this), withdrawAmount);
        _removeLiquidity(address(this));

        address swapToken = token1 == desiredToken ? token0 : token1;
        address[] memory path = new address[](2);
        path[0] = swapToken;
        path[1] = desiredToken;

        _approveTokenIfNeeded(path[0], address(router));
        router.swapExactTokensForTokens(
            IERC20(swapToken).balanceOf(address(this)),
            desiredTokenOutMin,
            path,
            address(this),
            block.timestamp
        );

        _returnAssets(path);
    }

    function _swapAndAddLiquidity(address tokenIn, uint256 tokenAmountOutMin) internal {
        (uint256 reserveA, uint256 reserveB, ) = pair.getReserves();
        bool isInputA = pair.token0() == tokenIn;
        require(isInputA || pair.token1() == tokenIn, "Zap: input token not present in liquidity pair");

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = isInputA ? pair.token1() : pair.token0();

        uint256 fullInvestment = IERC20(tokenIn).balanceOf(address(this));
        uint256 swapAmountIn;
        if (isInputA) {
            swapAmountIn = _getSwapAmount(fullInvestment, reserveA, reserveB);
        } else {
            swapAmountIn = _getSwapAmount(fullInvestment, reserveB, reserveA);
        }

        _approveTokenIfNeeded(path[0], address(router));
        uint256[] memory swapedAmounts =
            router.swapExactTokensForTokens(swapAmountIn, tokenAmountOutMin, path, address(this), block.timestamp);

        _approveTokenIfNeeded(path[1], address(router));
        (, , uint256 amountLiquidity) =
            router.addLiquidity(
                path[0],
                path[1],
                fullInvestment - swapedAmounts[0],
                swapedAmounts[1],
                1,
                1,
                address(this),
                block.timestamp
            );

        IERC20(address(pair)).safeTransfer(msg.sender, amountLiquidity);
        _returnAssets(path);
    }

    function _removeLiquidity(address to) private returns (uint256, uint256) {
        IERC20(address(pair)).safeTransfer(address(pair), IERC20(address(pair)).balanceOf(address(this)));
        (uint256 amount0, uint256 amount1) = pair.burn(to);
        return (amount0, amount1);
    }

    function _getSwapAmount(
        uint256 investmentA,
        uint256 reserveA,
        uint256 reserveB
    ) private view returns (uint256 swapAmount) {
        uint256 halfInvestment = investmentA / 2;
        uint256 nominator = router.getAmountOut(halfInvestment, reserveA, reserveB);
        uint256 denominator = router.quote(halfInvestment, reserveA + halfInvestment, reserveB - nominator);
        swapAmount = investmentA - Babylonian.sqrt((halfInvestment * halfInvestment * nominator) / denominator);
    }

    function _returnAssets(address[] memory tokens) private {
        uint256 balance;
        for (uint256 i; i < tokens.length; i++) {
            balance = IERC20(tokens[i]).balanceOf(address(this));
            if (balance > 0) {
                if (tokens[i] == WETH) {
                    IWETH(WETH).withdraw(balance);
                    (bool success, ) = msg.sender.call{value: balance}(new bytes(0));
                    require(success, "ETH transfer failed");
                } else {
                    IERC20(tokens[i]).safeTransfer(msg.sender, balance);
                }
            }
        }
    }

    function _approveTokenIfNeeded(address token, address spender) private {
        if (IERC20(token).allowance(address(this), spender) == 0) {
            IERC20(token).safeApprove(spender, type(uint256).max);
        }
    }
}
