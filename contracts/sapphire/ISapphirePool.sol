// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface ISapphirePool {
    function setCoreSwapLimit(address _coreVault, uint256 _amount) external;

    function setTokenLimit(address _tokenAddress, uint256 _limit) external;

    function swap(address _tokenIn, address _tokenOut, uint256 _amountIn) external;

    function deposit(address _token, uint256 _amount) external;

    function withdraw(address _token, uint256 _amount) external;

    function getTokenUtilization(address _tokenAddress) external view returns (uint256, uint256);

    function accumulatedRewardAmount(address _token, address _user) external view returns (uint256);

    function coreSwapLimits(address _coreAddress) external view returns (uint256);
}
