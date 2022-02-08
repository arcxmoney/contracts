// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import {ISapphirePool} from "./ISapphirePool.sol";

import {SafeERC20} from "../../lib/SafeERC20.sol";
import {Adminable} from "../../lib/Adminable.sol";
import {Address} from "../../lib/Address.sol";
import {IERC20Metadata} from "../../token/IERC20Metadata.sol";
import {InitializableBaseERC20} from "../../token/InitializableBaseERC20.sol";

import "hardhat/console.sol";

/**
 * @notice A special AMM-like contract where swapping is permitted only by an approved
 * Sapphire Core. A portion of the interest made from the loans by the Cores is deposited
 * into this contract, and shared among the LPs.
 */
contract SapphirePool is ISapphirePool, Adminable, InitializableBaseERC20 {
    
    /* ========== Libraries ========== */

    using Address for address;
    
    /* ========== Structs ========== */

    struct AssetUtilization {
        uint256 amountUsed;
        uint256 limit;
    }

    // Used in _getWithdrawAmounts to get around the stack too deep error.
    struct WithdrawAmountInfo {
        uint256 poolValue;
        uint256 totalSupply;
        uint256 withdrawAmt;
        uint256 scaledWithdrawAmt;
        uint256 totalWithdraw;
        uint256 userDeposit;
        uint256 userReward;
    }
    
    /* ========== Variables ========== */

    IERC20Metadata public credsToken;

    /**
     * @notice Determines the amount of creds the core can swap in. The amounts are stored in 
     * 18 decimals.
     */
    mapping (address => AssetUtilization) public override coreSwapUtilization;

    /**
     * @notice Determines the amount of tokens that can be deposited by 
     * liquidity providers. The amounts are stored in the asset's native decimals.
     */
    mapping (address => AssetUtilization) public override assetDepositUtilization;

    /**
     * @notice Determines the amount of tokens deposited by liquidity providers. Stored in 18
     * decimals.
     */
    mapping (address => uint256) public override userDepositAmounts;

    /**
     * @dev Stores the assets that have been historically allowed to be deposited.
     */
    address[] internal supportedDepositAssets;

    /**
     * @dev Stores the cores that have historically been approved to swap in assets.
     */
    address[] internal supportedCores;

    mapping (address => uint8) internal _tokenDecimals;

    /* ========== Events ========== */

    event CoreSwapLimitSet(address _core, uint256 _limit);

    event DepositLimitSet(address _asset, uint256 _limit);

    event TokensDeposited(
        address _user,
        address _token,
        uint256 _depositAmount,
        uint256 _lpTokensAmount
    );

    event TokensWithdrawn(
        address _user, 
        address _token, 
        uint256 _credsAmount, 
        uint256 _withdrawAmount
    );

    event TokensSwapped(
        address _user, 
        address _tokenIn, 
        address _tokenOut, 
        uint256 _amountIn,
        uint256 _amountOut
    );

    /* ========== Restricted functions ========== */

    function init(
        string memory name_,
        string memory symbol_,
        address _credsToken
    ) 
        external 
        onlyAdmin 
        initializer
    {
        _init(name_, symbol_, 18);

        require (
            _credsToken.isContract(),
            "SapphirePool: Creds address is not a contract"
        );
        credsToken = IERC20Metadata(_credsToken);
    }

    /**
     * @notice Sets the limit for how many Creds can be swapped in by a Core.
     * The sum of the core limits cannot be greater than the sum of the deposit limits.
     */
    function setCoreSwapLimit(
        address _coreAddress, 
        uint256 _limit
    ) 
        external
        override
        onlyAdmin
    {
        (
            uint256 sumOfDepositLimits,
            uint256 sumOfCoreLimits,
            bool isCoreSupported
        ) = _getSumOfLimits(_coreAddress);

        require(
            sumOfCoreLimits + _limit <= sumOfDepositLimits,
            "SapphirePool: swap limit is greater than the sum of the deposit limits"
        );

        if (!isCoreSupported) {
            supportedCores.push(_coreAddress);
        }

        coreSwapUtilization[_coreAddress].limit = _limit;

        emit CoreSwapLimitSet(_coreAddress, _limit);
    }

    /**
     * @notice Sets the limit for the deposit token. If the limit is > 0, the token is added to
     * the list of the supported deposit assets. These assets also become available for being
     * swapped by the Cores.
     * The sum of the deposit limits cannot be smaller than the sum of the core limits.
     * @param _tokenAddress The address of the deposit token.
     * @param _limit The limit for the deposit token, in its own native decimals.
     */
    function setDepositLimit(
        address _tokenAddress, 
        uint256 _limit
    )
        external
        override
        onlyAdmin
    {
        bool isSupportedAsset = _tokenDecimals[_tokenAddress] > 0;
        require(
            _limit > 0 || isSupportedAsset,
            "SapphirePool: cannot set the limit of an unsupported asset to 0"
        );

        // Add the token to the supported assets array if limit is > 0
        if (_limit > 0 && !isSupportedAsset) {
            supportedDepositAssets.push(_tokenAddress);

            // Save token decimals to later compute the token scalar
            _tokenDecimals[_tokenAddress] = IERC20Metadata(_tokenAddress).decimals();
        }

        assetDepositUtilization[_tokenAddress].limit = _limit;

        (
            uint256 sumOfDepositLimits,
            uint256 sumOfCoreLimits,
        ) = _getSumOfLimits(address(0));

        require(
            sumOfDepositLimits >= sumOfCoreLimits,
            "SapphirePool: sum of deposit limits smaller than the sum of the swap limits"
        );

        emit DepositLimitSet(_tokenAddress, _limit);
    }

    /**
     * @notice Performs a swap between the specified tokens, for the given amount. Assumes
     * a 1:1 conversion. Only approved cores have permission to swap.
     */
    function swap(
        address _tokenIn, 
        address _tokenOut, 
        uint256 _amountIn
    ) 
        external
        override
    {
        uint256 amountOut;

        require(
            coreSwapUtilization[msg.sender].limit > 0,
            "SapphirePool: caller is not an approved core"
        );

        require(
            _tokenIn != _tokenOut && (
                _tokenIn == address(credsToken) ||
                _tokenOut == address(credsToken)
            ),
            "SapphirePool: invalid swap tokens"
        );

        if (_tokenIn == address(credsToken)) {
            amountOut = _swapCredsForStables(
                _tokenOut,
                _amountIn
            );
        } else {
            amountOut = _swapStablesForCreds(
                _tokenIn,
                _amountIn
            );
        }
        
        emit TokensSwapped(
            msg.sender,
            _tokenIn,
            _tokenOut,
            _amountIn,
            amountOut
        );
    }

    /* ========== Public functions ========== */

    /**
     * @notice Deposits the given amount of tokens into the pool. The token must be a supported
     * deposit asset.
     */
    function deposit(
        address _token,
        uint256 _amount
    ) 
        external
        override
    {
        AssetUtilization storage utilization = assetDepositUtilization[_token];

        require(
            utilization.amountUsed + _amount <= utilization.limit,
            "SapphirePool: cannot deposit more than the limit"
        );

        require(
            _tokenDecimals[_token] > 0,
            "SapphirePool: the given lp token has a scalar of 0"
        );

        uint256 scaledAmount = _getScaledAmount(_amount, _tokenDecimals[_token], _decimals);
        uint256 poolValue = getPoolValue();
        
        uint256 lpToMint;
        if (poolValue > 0) {
            lpToMint = scaledAmount * totalSupply() / poolValue;
        } else {
            lpToMint = scaledAmount;
        }

        utilization.amountUsed += _amount;
        userDepositAmounts[msg.sender] += scaledAmount;
        
        _mint(msg.sender, lpToMint);

        SafeERC20.safeTransferFrom(
            IERC20Metadata(_token), 
            msg.sender, 
            address(this), 
            _amount
        );

        emit TokensDeposited(
            msg.sender,
            _token,
            _amount,
            lpToMint
        );
    }

    /**
     * @notice Exchanges the give amount of Creds for the equivalent amount of the given token,
     * plus the proportional rewards. The Creds exchanged are burned.
     * @param _amount The amount of Creds to exchange.
     * @param _withdrawToken The token to exchange for.
     */
    function withdraw(
        uint256 _amount,
        address _withdrawToken 
    ) 
        external
        override
    {
        // When we add a new supporting token, we set its decimals to this mapping.
        // So we can check with O(1) if it's a supported token by checking if its decimals are set.
        require(
            _tokenDecimals[_withdrawToken] > 0,
            "SapphirePool: unsupported withdraw token"
        );

        (
            uint256 assetUtilizationReduceAmt,
            uint256 userDepositReduceAmt,
            uint256 scaledWithdrawAmt
        ) = _getWithdrawAmounts(_amount, _withdrawToken);

        assetDepositUtilization[_withdrawToken].amountUsed -= assetUtilizationReduceAmt;
        userDepositAmounts[msg.sender] -= userDepositReduceAmt;

        // uint256 poolValue = getPoolValue();
        // uint256 totalSupply = totalSupply();

        // uint256 withdrawAmt = _amount * poolValue / totalSupply;
        // uint256 scaledWithdrawAmt = _getScaledAmount(
        //     withdrawAmt, 
        //     _decimals, 
        //     _tokenDecimals[_withdrawToken]
        // );

        // console.log("a");
        // uint256 totalWithdraw = balanceOf(msg.sender) * poolValue / totalSupply;
        // console.log("a1");
        // uint256 userDeposit = userDepositAmounts[msg.sender];
        // // Amount available for withdraw, excluding the deposited amount
        // console.log("a2");
        // console.log("totalWithdraw", totalWithdraw);
        // console.log("userDeposit", userDeposit);
        // uint256 userReward = totalWithdraw - userDeposit;

        // console.log("a3");
        // console.log("withdrawAmt", withdrawAmt);
        // console.log("userReward", userReward);
        // console.log("userDeposit", userDeposit);

        // if (userReward == 0) {
        //     console.log("a");
        //     assetDepositUtilization[_withdrawToken].amountUsed -= scaledWithdrawAmt;
        //     console.log("a4");
        //     userDepositAmounts[msg.sender] -= withdrawAmt;
        //     console.log("a5");
        // } else {
        //     console.log("a6");
        //     console.log("withdrawAmt", withdrawAmt);
        //     console.log("userReward", userReward);
        //     uint256 reduceDeposit;// = withdrawAmt - userReward;

        //     if (userReward > withdrawAmt) {
        //         console.log("b");
        //         if (userDeposit > withdrawAmt) {
        //             console.log("b1");
        //             reduceDeposit = withdrawAmt;
        //         } else {
        //             console.log("b2");
        //             reduceDeposit = userDeposit;
        //         }
        //     } else {
        //         console.log("b3");
        //         reduceDeposit = withdrawAmt - userReward;
        //     }

        //     console.log("b4");
        //     if (reduceDeposit > userDeposit) {
        //         console.log("b5");
        //         reduceDeposit = userDeposit;
        //     }

        //     console.log("a7");
        //     assetDepositUtilization[_withdrawToken].amountUsed -= _getScaledAmount(
        //         reduceDeposit,
        //         _decimals,
        //         _tokenDecimals[_withdrawToken]
        //     );
        //     console.log("a8");
        //     userDepositAmounts[msg.sender] -= reduceDeposit;
        //     console.log("a9");
        // }
        
        // console.log("a10")`;
        _burn(msg.sender, _amount);

        SafeERC20.safeTransfer(
            IERC20Metadata(_withdrawToken), 
            msg.sender, 
            scaledWithdrawAmt
        );

        emit TokensWithdrawn(
            msg.sender, 
            _withdrawToken, 
            _amount, 
            scaledWithdrawAmt
        );
    }

    /* ========== View functions ========== */

    /**
     * @notice Returns the rewards accumulated into the pool
     */
    function accumulatedRewardAmount() 
        external
        override 
        view 
        returns (uint256)
    {
        uint256 poolValue = getPoolValue();

        uint256 depositValue;

        for (uint8 i = 0; i < supportedDepositAssets.length; i++) {
            address token = supportedDepositAssets[i];
            depositValue += _getScaledAmount(
                assetDepositUtilization[token].amountUsed, 
                _tokenDecimals[token], 
                18
            );
        }

        return poolValue - depositValue;
    }

    /**
     * @notice Returns the list of the supported assets for depositing by LPs and swapping by Cores.
     * If an asset has a limit of 0, it will be excluded from the list.
     */
    function getDepositAssets() 
        external 
        view 
        override
        returns (address[] memory)
    {
        uint8 validAssetCount = 0;

        for (uint8 i = 0; i < supportedDepositAssets.length; i++) {
            address token = supportedDepositAssets[i];

            if (assetDepositUtilization[token].limit > 0) {
                validAssetCount++;
            }
        }

        address[] memory result = new address[](validAssetCount);

        for (uint8 i = 0; i < validAssetCount; i++) {
            address token = supportedDepositAssets[i];

            if (assetDepositUtilization[token].limit > 0) {
                result[i] = token;
            }
        }

        return result;
    }

    /**
     * @notice Returns the value of the pool in terms of the deposited stablecoins and creds.
     */
    function getPoolValue() 
        public 
        view 
        override
        returns (uint256)
    {
        uint256 result;

        for (uint8 i = 0; i < supportedDepositAssets.length; i++) {
            address token = supportedDepositAssets[i];
            uint8 decimals = _tokenDecimals[token];

            result += _getScaledAmount(
                IERC20Metadata(token).balanceOf(address(this)),
                decimals,
                18
            );
        }

        result += credsToken.balanceOf(address(this));

        return result;
    }

    /* ========== Private functions ========== */

    /**
     * @dev Used to compute the amount of LP tokens to mint 
     */
    function _getScaledAmount(
        uint256 _amount,
        uint8 _decimalsIn,
        uint8 _decimalsOut
    ) 
        internal
        pure
        returns (uint256)
    {
        if (_decimalsIn == _decimalsOut) {
            return _amount;
        }

        if (_decimalsIn > _decimalsOut) {
            return _amount / 10 ** (_decimalsIn - _decimalsOut);
        } else {
            return _amount * 10 ** (_decimalsOut - _decimalsIn);
        }
    }

    function _swapCredsForStables(
        address _tokenOut,
        uint256 _credsAmount
    )
        private
        returns (uint256)
    {
        AssetUtilization storage utilization = coreSwapUtilization[msg.sender];

        require(
            utilization.amountUsed + _credsAmount <= utilization.limit,
            "SapphirePool: core swap limit exceeded"
        );

        // Ensure out token is supported. All supported tokens should have their decimals saved
        uint8 decimalsOut = _tokenDecimals[_tokenOut];
        require(
            decimalsOut > 0,
            "SapphirePool: unsupported out token"
        );

        uint256 expectedOutAmount = _getScaledAmount(
            _credsAmount,
            _decimals,
            decimalsOut
        );

        // Increase core utilization
        utilization.amountUsed += _credsAmount;

        SafeERC20.safeTransferFrom(
            IERC20Metadata(credsToken), 
            msg.sender, 
            address(this), 
            _credsAmount
        );

        SafeERC20.safeTransfer(
            IERC20Metadata(_tokenOut), 
            msg.sender, 
            expectedOutAmount
        );

        return expectedOutAmount;
    }

    function _swapStablesForCreds(
        address _tokenIn,
        uint256 _stablesAmount
    )
        private
        returns (uint256)
    {
        AssetUtilization storage utilization = coreSwapUtilization[msg.sender];

        // Ensure out token is supported. All supported tokens should have their decimals saved
        uint8 stableDecimals = _tokenDecimals[_tokenIn];
        require(
            _tokenDecimals[_tokenIn] > 0,
            "SapphirePool: unsupported in token"
        );

        uint256 credsOutAmount = _getScaledAmount(
            _stablesAmount,
            stableDecimals,
            _decimals
        );

        utilization.amountUsed -= credsOutAmount;

        SafeERC20.safeTransferFrom(
            IERC20Metadata(_tokenIn), 
            msg.sender, 
            address(this),
            _stablesAmount
        );

        SafeERC20.safeTransfer(
            IERC20Metadata(credsToken), 
            msg.sender, 
            credsOutAmount
        );

        return credsOutAmount;
    }

    /**
     * @dev Returns the sum of the deposit limits and the sum of the core swap limits
     * Optionally, accepts an address of a core and returns if that core is already supported
     */
    function _getSumOfLimits(
        address _optionalCoreCheck
    )
        private
        view
        returns (uint256, uint256, bool)
    {
        uint256 sumOfDepositLimits;
        uint256 sumOfCoreLimits;
        bool isCoreSupported;
        uint8 decimals;

        for (uint8 i = 0; i < supportedDepositAssets.length; i++) {
            address token = supportedDepositAssets[i];
            decimals = _tokenDecimals[token];
            
            sumOfDepositLimits += _getScaledAmount(
                assetDepositUtilization[token].limit, 
                decimals, 
                18
            );
        }

        for (uint8 i = 0; i < supportedCores.length; i++) {
            address core = supportedCores[i];
            
            sumOfCoreLimits += coreSwapUtilization[core].limit;

            if (core == _optionalCoreCheck) {
                isCoreSupported = true;
            }
        }

        return (sumOfDepositLimits, sumOfCoreLimits, isCoreSupported);
    }

    /**
     * @dev Returns the amount to be reduced from the user's deposit mapping, token deposit
     * usage and the amount of tokens to be withdrawn, in the withdraw token decimals.
     */
    function _getWithdrawAmounts(
        uint256 _amount,
        address _withdrawToken
    )
        private
        view
        returns (uint256, uint256, uint256)
    {
        WithdrawAmountInfo memory info = _getWithdrawAmountsVars(_amount, _withdrawToken);

        if (info.userReward == 0) {
            return (
                info.scaledWithdrawAmt,
                info.withdrawAmt,
                info.scaledWithdrawAmt
            );
        } else {
            uint256 reduceDeposit;

            if (info.userReward > info.withdrawAmt) {
                if (info.userDeposit > info.withdrawAmt) {
                    reduceDeposit = info.withdrawAmt;
                } else {
                    reduceDeposit = info.userDeposit;
                }
            } else {
                reduceDeposit = info.withdrawAmt - info.userReward;
            }

            if (reduceDeposit > info.userDeposit) {
                reduceDeposit = info.userDeposit;
            }

            return (
                _getScaledAmount(
                    reduceDeposit,
                    _decimals,
                    _tokenDecimals[_withdrawToken]
                ),
                reduceDeposit,
                info.scaledWithdrawAmt
            );
        }
    }

    function _getWithdrawAmountsVars(
        uint256 _amount,
        address _withdrawToken
    )
        private
        view
        returns (WithdrawAmountInfo memory)
    {
        WithdrawAmountInfo memory info;
        
        info.poolValue = getPoolValue();
        info.totalSupply = totalSupply();

        info.withdrawAmt = _amount * info.poolValue / info.totalSupply;
        info.scaledWithdrawAmt = _getScaledAmount(
            info.withdrawAmt, 
            _decimals, 
            _tokenDecimals[_withdrawToken]
        );

        info.totalWithdraw = balanceOf(msg.sender) * info.poolValue / info.totalSupply;
        info.userDeposit = userDepositAmounts[msg.sender];
        // Amount available for withdraw, excluding the deposited amount
        info.userReward = info.totalWithdraw - info.userDeposit;

        return info;
    }
}
