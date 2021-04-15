// SPDX-License-Identifier: MIT

pragma solidity ^0.5.16;

import {IERC20} from "../token/IERC20.sol";

import {Adminable} from "../lib/Adminable.sol";
import {SafeMath} from "../lib/SafeMath.sol";
import {Permittable} from "../token/Permittable.sol";

import {SyntheticStorageV2} from "./SyntheticStorageV2.sol";

contract SyntheticTokenV2 is Adminable, SyntheticStorageV2, IERC20, Permittable {

    using SafeMath for uint256;

    /* ========== Events ========== */

    event MinterAdded(address _minter, uint256 _limit);

    event MinterRemoved(address _minter);

    event MinterLimitUpdated(address _minter, uint256 _limit);

    event InitCalled();

    /* ========== Modifiers ========== */

    modifier onlyMinter() {
        require(
            _minters[msg.sender] = true,
            "SyntheticTokenV2: only callable by minter"
        );
        _;
    }

    /* ========== Init Function ========== */

/**
     * @dev Initialise the synthetic token
     *
     * @param name The name of the token
     * @param symbol The symbol of the token
     * @param version The version number of this token
     */
    function init(
        string memory name,
        string memory symbol,
        string memory version
    )
        public
        onlyAdmin
    {
        _name = name;
        _symbol = symbol;
        _version = version;

        DOMAIN_SEPARATOR = _initDomainSeparator(name, version);

        emit InitCalled();
    }

    /* ========== View Functions ========== */

    function name()
        external
        view
        returns (string memory)
    {
        return _name;
    }

    function symbol()
        external
        view
        returns (string memory)
    {
        return _symbol;
    }

    function decimals()
        external
        pure
        returns (uint8)
    {
        return 18;
    }

    function version()
        external
        view
        returns (string memory)
    {
        return _version;
    }

    function totalSupply()
        public
        view
        returns (uint256)
    {
        return _totalSupply;
    }

    function balanceOf(
        address account
    )
        public
        view
        returns (uint256)
    {
        return _balances[account];
    }

    function allowance(
        address _owner,
        address _spender
    )
        public
        view
        returns (uint256)
    {
        return _allowances[_owner][_spender];
    }

    function getAllMinters()
        external
        view
        returns (address[] memory)
    {
        return _mintersArray;
    }

    function isValidMinter(
        address _minter
    )
        external
        view
        returns (bool)
    {
        return _minters[_minter];
    }

    function getMinterIssued(
        address _minter
    )
        external
        view
        returns (uint256)
    {
        return _minterIssued[_minter];
    }

    function getMinterLimit(
        address _minter
    )
        external
        view
        returns (uint256)
    {
        return _minterLimits[_minter];
    }

    /* ========== Admin Functions ========== */

    /**
     * @dev Add a new minter to the synthetic token.
     *
     * @param _minter The address of the minter to add
     * @param _limit The starting limit for how much this synth can mint
     */
    function addMinter(
        address _minter,
        uint256 _limit
    )
        external
        onlyAdmin
    {
        require(
            _minters[_minter] != true,
            "SyntheticTokenV2: Minter already exists"
        );

        _mintersArray.push(_minter);
        _minters[_minter] = true;
        _minterLimits[_minter] = _limit;

        emit MinterAdded(_minter, _limit);
    }

    /**
     * @dev Remove a minter from the synthetic token
     *
     * @param _minter Address to remove the minter
     */
    function removeMinter(
        address _minter
    )
        external
        onlyAdmin
    {
        require(
            _minters[_minter] == true,
            "SyntheticTokenV2: minter does not exist"
        );

        for (uint256 i = 0; i < _mintersArray.length; i++) {
            if (address(_mintersArray[i]) == _minter) {
                delete _mintersArray[i];
                _mintersArray[i] = _mintersArray[_mintersArray.length - 1];
                _mintersArray.length--;

                break;
            }
        }

        delete _minters[_minter];
        delete _minterLimits[_minter];

        emit MinterRemoved(_minter);
    }

    /**
     * @dev Update the limit of the minter
     *
     * @param _minter The address of the minter to set
     * @param _limit The new limit to set for this address
     */
    function updateMinterLimit(
        address _minter,
        uint256 _limit
    )
        public
        onlyAdmin
    {
        require(
            _minters[_minter] == true,
            "SyntheticTokenV2: minter does not exist"
        );

        _minterLimits[_minter] = _limit;

        emit MinterLimitUpdated(_minter, _limit);
    }

    /* ========== Minter Functions ========== */

    /**
     * @dev Mint synthetic tokens
     *
     * @notice Can only be called by a valid minter.
     *
     * @param _to The destination to mint the synth to
     * @param _value The amount of synths to mint
     */
    function mint(
        address _to,
        uint256 _value
    )
        external
        onlyMinter
    {
        uint256 issuedAmount = _minterIssued[msg.sender].add(_value);

        require(
            issuedAmount <= _minterLimits[msg.sender],
            "SyntheticTokenV2: minter limit reached"
        );

        _minterIssued[msg.sender] = issuedAmount;
        _mint(_to, _value);
    }

    /**
     * @dev Burn synthetic tokens of the msg.sender
     *
     * @notice Can only be called by a valid minter
     *
     * @param _value The amount of the synth to destroy
     */
    function destroy(
        uint256 _value
    )
        external
        onlyMinter
    {
        _minterIssued[msg.sender] = _minterIssued[msg.sender].sub(_value);

        _destroy(_value);
    }

    /* ========== ERC20 Mutative Functions ========== */

    function transfer(
        address recipient,
        uint256 amount
    )
        public
        returns (bool)
    {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function approve(
        address spender,
        uint256 amount
    )
        public
        returns (bool)
    {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    )
        public
        returns (bool)
    {
        _transfer(sender, recipient, amount);
        _approve(
            sender,
            msg.sender,
            _allowances[sender][msg.sender].sub(amount)
        );

        return true;
    }

    /**
     * @dev Sets `value` as the allowance of `spender` over `owner`'s tokens,
     * assuming the latter's signed approval.
     *
     * IMPORTANT: The same issues Erc20 `approve` has related to transaction
     * ordering also apply here.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `owner` cannot be the zero address.
     * - `spender` cannot be the zero address.
     * - `deadline` must be a timestamp in the future.
     * - `v`, `r` and `s` must be a valid `secp256k1` signature from `owner`
     * over the Eip712-formatted function arguments.
     * - The signature must use `owner`'s current nonce.
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        public
    {
        _permit(
            owner,
            spender,
            value,
            deadline,
            v,
            r,
            s
        );

        _approve(owner, spender, value);
    }

    /* ========== Internal Functions ========== */

    function _transfer(
        address _sender,
        address _recipient,
        uint256 _amount
    )
        internal
    {
        require(
            _sender != address(0),
            "SyntheticTokenV2: transfer from the zero address"
        );

        require(
            _recipient != address(0),
            "SyntheticTokenV2: transfer to the zero address"
        );

        _balances[_sender]      = _balances[_sender].sub(_amount);
        _balances[_recipient]   = _balances[_recipient].add(_amount);

        emit Transfer(_sender, _recipient, _amount);
    }

    function _mint(
        address _account,
        uint256 _amount
    )
        internal
    {
        require(
            _account != address(0),
            "SyntheticTokenV2: cannot mint to the zero address"
        );

        _totalSupply = _totalSupply.add(_amount);

        _balances[_account] = _balances[_account].add(_amount);

        emit Transfer(address(0), _account, _amount);
    }

    function _destroy(
        uint256 _value
    )
        internal
    {
        require(
            _balances[msg.sender] >= _value,
            "SyntheticTokenV2: cannot destroy more tokens than the balance"
        );

        _balances[msg.sender] = _balances[msg.sender].sub(_value);
        _totalSupply = _totalSupply.sub(_value);

        emit Transfer(msg.sender, address(0), _value);
    }

    function _approve(
        address _owner,
        address _spender,
        uint256 _amount
    )
        internal
    {
        require(
            _owner != address(0),
            "SyntheticTokenV2: approve from the zero address"
        );

        require(
            _spender != address(0),
            "SyntheticTokenV2: approve to the zero address"
        );

        _allowances[_owner][_spender] = _amount;
        emit Approval(_owner, _spender, _amount);
    }
}