// SPDX-License-Identifier: MIT

pragma solidity ^0.5.16;

contract SapphireCoreStorage {
    /**
    * @dev The high/default collateral ratio for an untrusted borrower.
    */
    uint256 internal highCollateralRatio;

    /**
    * @dev The lowest collateral ratio for an untrusted borrower.
    */
    uint256 internal lowCollateralRatio;

    /**
    * @dev The assesor that will determine the collateral-ratio.
    */
    address internal collateralRatioAssesor;

    /**
    * @dev The address which collects fees when liquidations occur.
    */
    address internal feeCollector;

    /**
     * @dev The actual address of the collateral used for this core system.
     */
    address public collateralAsset;

    /**
     * @dev The address of the synthetic token where this core is approved to mint from
     */
    address public syntheticAsset;

    /**
    * @dev The actual amount of collatteral provided to the protocol.
    *      This amount will be multiplied by the precision scalar if the token
    *      has less than 18 decimals precision.
    */
    uint256 public totalCollateral;

    /**
     * @dev An account of the total amount being borrowed by all depositors. This includes
     *      the amount of interest accrued.
     */
    uint256 public totalBorrowed;

    /**
     * @dev The maximum amount which can be borrowed within a contract. This includes
     *      the amount of interest accrued.
     */
    uint256 internal totalBorrowLimit;

    /**
     * @dev The minimum amount which has to be borrowed by a vault. This includes
     *      the amount of interest accrued.
     */
    uint256 internal vaultBorrowMinimum;

    /**
     * @dev The maximum amount which has to be borrowed by a vault. This includes
     *      the amount of interest accrued.
     */
    uint256 internal vaultBorrowMaximum;

}
