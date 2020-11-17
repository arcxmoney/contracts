// SPDX-License-Identifier: MIT

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import {IERC20} from "../token/IERC20.sol";
import {ISyntheticToken} from "../token/ISyntheticToken.sol";

import {SafeMath} from "../lib/SafeMath.sol";
import {Amount} from "../lib/Amount.sol";

import {SyntheticStorage} from "./SyntheticStorage.sol";

import {Adminable} from "../lib/Adminable.sol";

contract SyntheticTokenV1 is Adminable, SyntheticStorage, IERC20, ISyntheticToken {

    using SafeMath for uint256;
    using Amount for Amount.Principal;

    /* ========== Events ========== */

    event MinterAdded(address _minter, uint256 _limit);

    event MinterRemoved(address _minter);

    event MinterLimitUpdated(address _minter, uint256 _limit);

    event MetadataChanged();

    /* ========== Modifiers ========== */

    modifier onlyMinter() {
        require(
            _minters[msg.sender] == true,
            "SyntheticToken: only callable by minter"
        );
        _;
    }

    /* ========== Init Function ========== */

    function init(
        string memory __name,
        string memory __symbol,
        uint8 __version
    )
        public
        onlyAdmin
    {
        _name = __name;
        _symbol = __symbol;
        _version = __version;

        _symbolKey = keccak256(
            abi.encode(_symbol, _version)
        );
    }

    /* ========== View Functions ========== */

    function name()
        public
        view
        returns (string memory)
    {
        return _name;
    }

    function symbol()
        public
        view
        returns (string memory)
    {
        return _symbol;
    }

    function decimals()
        public
        view
        returns (uint8)
    {
        return 18;
    }

    function symbolKey()
        external
        view
        returns (bytes32)
    {
        return _symbolKey;
    }

    function version()
        external
        view
        returns (uint8)
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
        address owner,
        address spender
    )
        public
        view
        returns (uint256)
    {
        return _allowances[owner][spender];
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
        returns (Amount.Principal memory)
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

    function updateMetadata(
        string calldata __name,
        string calldata __symbol
    )
        external
        onlyAdmin
    {
        _name = __name;
        _symbol = __symbol;
        emit MetadataChanged();
    }

    function addMinter(
        address _minter,
        uint256 _limit
    )
        external
        onlyAdmin
    {
        require(
            _minters[_minter] != true,
            "Minter already exists"
        );

        _mintersArray.push(_minter);
        _minters[_minter] = true;
        _minterLimits[_minter] = _limit;

        emit MinterAdded(_minter, _limit);
    }

    function removeMinter(
        address _minter
    )
        external
        onlyAdmin
    {
        require(
            _minters[_minter] == true,
            "Minter does not exist"
        );

        for (uint i = 0; i < _mintersArray.length; i++) {
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

    function updateMinterLimit(
        address _minter,
        uint256 _limit
    )
        public
        onlyAdmin
    {
        require(
            _minters[_minter] == true,
            "Minter does not exist"
        );

        _minterLimits[_minter] = _limit;

        emit MinterLimitUpdated(_minter, _limit);
    }

    /* ========== Minter Functions ========== */

    function mint(
        address to,
        uint256 value
    )
        external
        onlyMinter
    {
        Amount.Principal memory issuedAmount = _minterIssued[msg.sender].add(
            Amount.Principal({ sign: true, value: value })
        );

        require(
            issuedAmount.sign == false || issuedAmount.value <= _minterLimits[msg.sender],
            "Minter limit reached"
        );

        _minterIssued[msg.sender] = issuedAmount;
        _mint(to, value);
    }

    function burn(
        address to,
        uint256 value
    )
        external
        onlyMinter
    {
        _minterIssued[msg.sender] = _minterIssued[msg.sender].sub(
            Amount.Principal({ sign: true, value: value })
        );

        _burn(to, value);
    }

    function transferCollateral(
        address token,
        address to,
        uint256 value
    )
        external
        onlyMinter
        returns (bool)
    {
        return IERC20(token).transfer(
            to,
            value
        );
    }

    /* ========== ERC20 Functions ========== */

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

    /* ========== Internal Functions ========== */

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    )
        internal
    {
        require(
            sender != address(0),
            "ERC20: transfer from the zero address"
        );

        require(
            recipient != address(0),
            "ERC20: transfer to the zero address"
        );

        _balances[sender] = _balances[sender].sub(amount);

        _balances[recipient] = _balances[recipient].add(amount);
        emit Transfer(sender, recipient, amount);
    }

    function _mint(
        address account,
        uint256 amount
    )
        internal
    {
        require(account != address(0), "ERC20: mint to the zero address");

        _totalSupply = _totalSupply.add(amount);
        _balances[account] = _balances[account].add(amount);
        emit Transfer(address(0), account, amount);
    }

    function _burn(
        address account,
        uint256 amount
    )
        internal
    {
        require(account != address(0), "ERC20: burn from the zero address");

        _balances[account] = _balances[account].sub(amount);
        _totalSupply = _totalSupply.sub(amount);
        emit Transfer(account, address(0), amount);
    }

    function _approve(
        address owner,
        address spender,
        uint256 amount
    )
        internal
    {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
}
