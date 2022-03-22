// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import {SharedPoolStructs} from "./SharedPoolStructs.sol";

interface ISapphirePool {
    /* ========== Mutating Functions ========== */

    function setCoreSwapLimit(address _coreAddress, uint256 _limit) external;

    function setDepositLimit(address _tokenAddress, uint256 _limit) external;

    function borrowStables(
        address _stablecoinAddress, 
        uint256 _scaledBorrowAmount,
        address _receiver
    ) external;

    function repayStables(
        address _stablecoinAddress, 
        uint256 _repayAmount
    ) external;

    function deposit(address _token, uint256 _amount) external;

    function withdraw(uint256 _amount, address _outToken) external;

    /* ========== View Functions ========== */

    function accumulatedRewardAmount() external view returns (uint256);

    function coreSwapUtilization(address _coreAddress) 
        external 
        view 
        returns (SharedPoolStructs.AssetUtilization memory);

    function assetDepositUtilization(address _tokenAddress) 
        external 
        view 
        returns (SharedPoolStructs.AssetUtilization memory);

    function deposits(address _userAddress) external view returns (uint256);

    function getDepositAssets() external view returns (address[] memory);

    function getPoolValue() external view returns (uint256);
}
