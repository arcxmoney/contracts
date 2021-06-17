pragma solidity 0.5.16;

import {ERC721Full} from "@openzeppelin/contracts/token/ERC721/ERC721Full.sol";
import {Counters} from "@openzeppelin/contracts/drafts/Counters.sol";
import {Adminable} from "../../lib/Adminable.sol";
import {Initializable} from "../../Initializable.sol";
import {DefiPassportStorage} from "./DefiPassportStorage.sol";
import {ISapphireCreditScore} from "../../debt/sapphire/ISapphireCreditScore.sol";

contract DefiPassport is ERC721Full, Adminable, DefiPassportStorage, Initializable{

    /* ========== Libraries ========== */

    using Counters for Counters.Counter;

    /* ========== Events ========== */

    event BaseURISet(string _baseURI);

    /* ========== Constructor ========== */

    constructor()
        ERC721Full("", "")
        public
    {}

    /* ========== Admin Setters ========== */

    function init(
        string calldata _name,
        string calldata _symbol,
        address _creditScoreAddress
    )
        external
        onlyAdmin
        initializer
    {
        name = _name;
        symbol = _symbol;

        require(
            _creditScoreAddress.isContract(),
            "DefiPassport: credit score address is not a contract"
        );

        creditScoreContract = ISapphireCreditScore(_creditScoreAddress);

        /*
        *   register the supported interfaces to conform to ERC721 via ERC165
        *   bytes4(keccak256('name()')) == 0x06fdde03
        *   bytes4(keccak256('symbol()')) == 0x95d89b41
        *   bytes4(keccak256('tokenURI(uint256)')) == 0xc87b56dd
        *
        *   => 0x06fdde03 ^ 0x95d89b41 ^ 0xc87b56dd == 0x5b5e139f
        */
        _registerInterface(0x5b5e139f);
    }

    function setBaseURI(
        string calldata _baseURI
    )
        external
        onlyAdmin
    {
        _setBaseURI(_baseURI);
        emit BaseURISet(_baseURI);
    }

    /* ========== Public Functions ========== */

    function mint(
        address _to,
        address _passportSkin
    )
        external
        returns (uint256)
    {
        (uint256 userCreditScore,,) = creditScoreContract.getLastScore(_to);

        require(
            userCreditScore > 0,
            "DefiPassport: the user has no credit score"
        );

        require(
            approvedSkins[_passportSkin],
            "DefiPassport: the skin is not approved"
        );

        // A user cannot have two passports
        require(
            balanceOf(_to) == 0,
            "DefiPassport: user already has a defi passport"
        );

        _tokenIds.increment();

        uint256 newTokenId = _tokenIds.current();
        _mint(_to, newTokenId);
        _setTokenURI(newTokenId, _toAsciiString(_passportSkin));

        return newTokenId;
    }

    /* ========== Private Functions ========== */

    /**
     * @dev Converts the given address to string. Used when minting new
     *      passports.
     */
    function _toAsciiString(
        address _address
    )
        private
        pure
        returns (string memory)
    {
        bytes memory s = new bytes(40);
        for (uint i = 0; i < 20; i++) {
            bytes1 b = bytes1(uint8(uint(uint160(_address)) / (2**(8*(19 - i)))));
            bytes1 hi = bytes1(uint8(b) / 16);
            bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
            s[2*i] = _char(hi);
            s[2*i+1] = _char(lo);            
        }
        return string(s);
    }

    function _char(
        bytes1 b
    )
        private
        pure
        returns (bytes1 c)
    {
        if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
        else return bytes1(uint8(b) + 0x57);
    }
}
