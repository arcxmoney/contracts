// SPDX-License-Identifier: MIT

pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import {Adminable} from "../lib/Adminable.sol";
import {Initializable} from "../lib/Initializable.sol";
import {Address} from "../lib/Address.sol";
import {SafeERC20} from "../lib/SafeERC20.sol";
import {SafeMath} from "../lib/SafeMath.sol";

import {BaseERC20} from "../token/BaseERC20.sol";
import {IPermittableERC20} from "../token/IPermittableERC20.sol";

/**
 * @notice An ERC20 that allows users to deposit a given token, where their
 *         balance is expressed in forms of shares. This will expose users to the
 *         increase and decrease of the balance of the token on the contract.
 *
 *         To withdraw their balance, users must first express their withdrawal
 *         intent, which will trigger a cooldown after which they will be able
 *         to reclaim their share.
 */
contract StakingAccrualERC20 is BaseERC20, Adminable, Initializable {

    /* ========== Libraries ========== */

    using Address for address;
    using SafeERC20 for IPermittableERC20;
    using SafeMath for uint256;

    /* ========== Structs ========== */

    struct Staker {
        uint256 balance;
        uint256 cooldownTimestamp;
    }

    /* ========== Variables ========== */

    uint256 constant BASE = 1e18;

    uint256 public exitCooldownDuration;

    uint8 private _decimals;

    IPermittableERC20 public stakingToken;

    /**
     * @notice Cooldown duration to be elapsed for users to exit
     */

    mapping (address => Staker) public stakers;

    /* ========== Events ========== */

    event ExitCooldownDurationSet(uint256 _duration);

    event TokensRecovered(uint256 _amount);

    event Staked(address indexed _user, uint256 _amount);

    event ExitCooldownStarted(address indexed _user, uint256 _cooldownEndTimestamp);

    event Exited(address indexed _user, uint256 _amount);

    event TokensClaimed(address indexed _user, uint256 _amount);

    /* ========== Constructor (ignore) ========== */

    constructor ()
        public
        BaseERC20("", "", 18)
    {}

    /* ========== Restricted Functions ========== */

    function init(
        string calldata __name,
        string calldata __symbol,
        uint8 __decimals,
        address _stakingToken,
        uint256 _exitCooldownDuration
    )
        external
        onlyAdmin
        initializer
    {
        _name = __name;
        _symbol = __symbol;
        _decimals = __decimals;
        exitCooldownDuration = _exitCooldownDuration;

        require (
            _stakingToken.isContract(),
            "StakingAccrualERC20: staking token is not a contract"
        );

        stakingToken = IPermittableERC20(_stakingToken);
    }

    /**
     * @notice Sets the exit cooldown duration
     */
    function setExitCooldownDuration(
        uint256 _duration
    )
        external
        onlyAdmin
    {
        require(
            exitCooldownDuration != _duration,
            "StakingAccrualERC20: the same cooldown is already set"
        );

        exitCooldownDuration = _duration;

        emit ExitCooldownDurationSet(exitCooldownDuration);
    }

    /**
     * @notice Recovers tokens from the totalShares

     */
    function recoverTokens(
        uint256 _amount
    )
        external
        onlyAdmin
    {
        uint256 contractBalance = stakingToken.balanceOf(address(this));

        require (
            _amount <= contractBalance,
            "StakingAccrualERC20: cannot recover more than the balance"
        );

        emit TokensRecovered(_amount);

        stakingToken.safeTransfer(
            getAdmin(),
            _amount
        );
    }

    /* ========== Restricted Functions ========== */

    function currentTimestamp()
        public
        view
        returns (uint256)
    {
        return block.timestamp;
    }

    /* ========== Mutative Functions ========== */

    function stake(
        uint256 _amount
    )
        public
    {
        Staker storage staker = stakers[msg.sender];

        require (
            staker.cooldownTimestamp == 0,
            "StakingAccrualERC20: cannot stake during cooldown period"
        );

        // Gets the amount of the staking token locked in the contract
        uint256 totalStakingToken = stakingToken.balanceOf(address(this));
        // Gets the amount of the staked token in existence
        uint256 totalShares = totalSupply();
        // If no the staked token exists, mint it 1:1 to the amount put in
        if (totalShares == 0 || totalStakingToken == 0) {
            _mint(msg.sender, _amount);
        }
        // Calculate and mint the amount of stToken the Token is worth. The ratio will change overtime, as stToken is burned/minted and Token deposited + gained from fees / withdrawn.
        else {
            uint256 what = _amount.mul(totalShares).div(totalStakingToken);
            _mint(msg.sender, what);
        }
        // Lock the staking token in the contract
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);

        emit Staked(msg.sender, _amount);
    }

    function stakeWithPermit(
        uint256 _amount,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        external
    {
        stakingToken.permit(
            msg.sender,
            address(this),
            _amount,
            _deadline,
            _v,
            _r,
            _s
        );
        stake(_amount);
    }

    /**
     * @notice Starts the exit cooldown. After this call the user won't be able to
     *         stake until they exit.
     */
    function startExitCooldown() public
    {
        Staker storage staker = stakers[msg.sender];

        require (
            balanceOf(msg.sender) > 0,
            "StakingAccrualERC20: user has 0 balance"
        );

        require (
            staker.cooldownTimestamp == 0,
            "StakingAccrualERC20: exit cooldown already started"
        );

        staker.cooldownTimestamp = currentTimestamp().add(exitCooldownDuration);

        emit ExitCooldownStarted(msg.sender, staker.cooldownTimestamp);
    }

    /**
     * @notice Returns the staked tokens proportionally, as long as
     *         the caller's cooldown time has elapsed. Exiting resets
     *         the cooldown so the user can start staking again.
     */
    function exit() external
    {
        Staker storage staker = stakers[msg.sender];
         // Gets the amount of stakedToken in existence
        uint256 totalShares = totalSupply();
        // Amount of shares to exit
        uint256 _share = balanceOf(msg.sender);

        require(
            _share > 0,
            "StakingAccrualERC20: user has 0 balance"
        );

        require(
            currentTimestamp() >= staker.cooldownTimestamp,
            "StakingAccrualERC20: exit cooldown not elapsed"
        );

        // Calculates the amount of staking token the staked token is worth
        uint256 what = _share.mul(stakingToken.balanceOf(address(this))).div(totalShares);
        _burn(msg.sender, _share);
        staker.cooldownTimestamp = 0;
        emit Exited(msg.sender, what);
        stakingToken.safeTransfer(msg.sender, what);
    }

    function claimFees() external
    {
        claimFor(msg.sender);
    }

    function claimFor(
        address _user
    )
        public
    {
    }

    function getExchangeRate() public view returns (uint256) {
        return stakingToken.balanceOf(address(this)).mul(1e18).div(totalSupply());
    }

    function toStakingToken(uint256 stTokenAmount) public view returns (uint256 tokenAmount) {
        tokenAmount = stTokenAmount.mul(stakingToken.balanceOf(address(this))).div(totalSupply());
    }

    function toStakedToken(uint256 token) public view returns (uint256 stToken) {
        stToken = token.mul(totalSupply()).div(stakingToken.balanceOf(address(this)));
    }
}
