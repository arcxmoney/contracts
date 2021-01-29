// SPDX-License-Identifier: MIT

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import {SafeMath} from "../../lib/SafeMath.sol";
import {IKeep3rV1} from "./IKeep3rV1.sol";
import {Ownable} from "../../lib/Ownable.sol";
import {UniswapV2Library} from "./UniswapV2Library.sol";
import {UniswapV2OracleLibrary} from "./UniswapV2OracleLibrary.sol";
import {FixedPoint} from "../../lib/FixedPoint.sol";

/**
 * @notice A Time-weighted average prices oracle and Keeper job for any uniswap pair
 */
contract ArcUniswapV2Oracle is Ownable {
    /* ========== Libraries ========== */

    using SafeMath for uint;

    /* ========== Storage ========== */

    IKeep3rV1 public KP3R;
    address public uniV2Factory;

    uint public periodWindow = 1 hours;
    // mapping from pair address to a list of price observations of that pair
    mapping(address => Observation[]) public pairObservations;

    address[] internal _pairs;
    mapping(address => bool) internal _known;

    /* ========== Types ========== */

    struct Observation {
        uint timestamp;
        uint price0Cumulative;
        uint price1Cumulative;
    }

    /* ========== Events ========== */

    event WorkDone(address keeper);
    event UpdatedAll(address caller);
    event PairUpdated(address pair);
    event PairAdded(address pair);
    event PairRemoved(address pair);
    event Keep3rV1AddressSet(address kp3r);
    event PeriodWindowSet(uint newPeriodWindow);

    /* ========== Modifiers ========== */

    modifier keeper() {
        require(KP3R.isKeeper(msg.sender), "::isKeeper: keeper is not registered");
        _;
    }

    /* ========== Constructor ========== */

    constructor(address _kp3r, address _uniV2Factory) public {
        require(
            _kp3r != address(0) && _uniV2Factory != address(0),
            "ArcUniswapV2Oracle:: Keeper and univ2Factory address must not be null"
        );

        KP3R = IKeep3rV1(_kp3r);
        uniV2Factory = _uniV2Factory;
    }

    /* ========== Keeper Functions ========== */

    /**
     * @notice Updates all pairs. The function to be called by the keeper to be rewarded.
     */
    function work() external keeper {
        bool worked = _updateAll();

        require(worked, "ArcUniswapV2Oracle::work: the work was not completed!");

        KP3R.worked(msg.sender);

        emit WorkDone(msg.sender);
    }

    /* ========== External Functions ========== */

    /**
     * @notice Updates the pair if it is known
     * @return `true` if the pair was successfully updated
     */
    function updatePair(address _token0, address _token1) external returns (bool) {
        address pair = UniswapV2Library.pairFor(uniV2Factory, _token0, _token1);

        require(_known[pair], "ArcUniswapV2Oracle::update: the pair is not known!");

        bool updated = _update(pair);

        if (updated) {
            emit PairUpdated(pair);
        }

        return updated;
    }

    /**
     * @notice Updates the given pair
     * @param _pair The pair to be updated
     */
    function updatePair(address _pair) external returns (bool) {
        require(_known[_pair], "The pair is not known");

        bool updated = _update(_pair);

        if (updated) {
            emit PairUpdated(_pair);
        }

        return updated;
    }

    /**
     * @notice Updates all pairs
     */
    function updateAll() external returns (bool) {
        bool worked = _updateAll();

        if (worked) {
            emit UpdatedAll(msg.sender);
        }

        return worked;
    }

    /* ========== Public Getters ========== */

    function getPairs() external view returns (address[] memory) {
        return _pairs;
    }

    /**
     * @notice Returns the last recorded observation for the pair
     * @param _pair The pair we want the last observation for
     */
    function lastObservation(address _pair) public view returns (Observation memory) {
        Observation[] memory foundPairObservations = pairObservations[_pair];
        return pairObservations[_pair][foundPairObservations.length - 1];
    }

    /**
     * @notice Returns true if pair is updatable given the period window. Therefore calling work() will yield a reward
     * @param _pair The pair to make the check for
     */
    function workable(address _pair) public view returns (bool) {
        Observation memory observation = lastObservation(_pair);
        uint timeElapsed = block.timestamp.sub(observation.timestamp);

        return timeElapsed > periodWindow;
    }

    /**
     * @notice Returns true if pair is updatable given the period window. Therefore calling work() will yield a reward
     */
    function workable(address _token0, address _token1) external view returns (bool) {
        address pair = UniswapV2Library.pairFor(uniV2Factory, _token0, _token1);

        Observation memory observation = lastObservation(pair);
        uint timeElapsed = block.timestamp.sub(observation.timestamp);

        return timeElapsed > periodWindow;
    }

    /**
     * @notice Iterates over all known pairs and checks wether there is at least one pair that is updatable
     */
    function workable() external view returns (bool) {
        for (uint i = 0; i < _pairs.length; i++) {
            if (workable(_pairs[i])) {
                return true;
            }
        }

        return false;
    }

    /**
     * @notice Computes and returns how much of `_tokenOut` you would get if you give `_amountIn` of `_tokenIn`
     *
     * @param _tokenIn the address of the token in
     * @param _amountIn the amount in terms of `_tokenIn`
     * @param _tokenOut the address of the token out
     */
    function current(
        address _tokenIn,
        uint _amountIn,
        address _tokenOut
    ) external view returns (uint) {
        address pair = UniswapV2Library.pairFor(uniV2Factory, _tokenIn, _tokenOut);

        require(_valid(pair, periodWindow.mul(2)), "ArcUniswapV2Oracle::current: stale prices");

        (address token0, ) = UniswapV2Library.sortTokens(_tokenIn, _tokenOut);
        Observation memory observation = lastObservation(pair);
        (uint price0Cumulative, uint price1Cumulative, ) = UniswapV2OracleLibrary.currentCumulativePrices(pair);

        if (block.timestamp == observation.timestamp) {
            Observation[] memory observationsForPair = pairObservations[pair];
            observation = pairObservations[pair][observationsForPair.length.sub(2)];
        }

        uint timeElapsed = block.timestamp.sub(observation.timestamp);
        timeElapsed = timeElapsed == 0 ? 1 : timeElapsed;

        if (token0 == _tokenIn) {
            // prettier-ignore
            return _computeAmountOut(
                observation.price0Cumulative,
                price0Cumulative,
                timeElapsed,
                _amountIn
            );
        } else {
            // prettier-ignore
            return _computeAmountOut(
                observation.price1Cumulative,
                price1Cumulative,
                timeElapsed,
                _amountIn
            );
        }
    }

    /**
     * @notice Gives a price quote based on the granularity
     * @param _tokenIn the token that `_amountIn` is denominated in
     * @param _amountIn the amount to get the quote for
     * @param _tokenOut the token that the result is denominated in
     * @param _granularity the granularity of the quote in terms of time. Ex. if `_granularity` = 2, the quote will be return a price based on the `periodWindow` * 2
     */
    function quote(
        address _tokenIn,
        uint _amountIn,
        address _tokenOut,
        uint _granularity
    ) external view returns (uint) {
        address pair = UniswapV2Library.pairFor(uniV2Factory, _tokenIn, _tokenOut);

        require(_valid(pair, periodWindow.mul(_granularity)), "ArcUniswapV2Oracle::quote: stale prices");

        (address token0, ) = UniswapV2Library.sortTokens(_tokenIn, _tokenOut);

        uint priceAverageCumulative = 0;
        uint length = pairObservations[pair].length - 1;
        uint i = length.sub(_granularity);

        uint nextIndex = 0;
        if (token0 == _tokenIn) {
            for (; i < length; i++) {
                nextIndex = i + 1;
                priceAverageCumulative += _computeAmountOut(
                    pairObservations[pair][i].price0Cumulative,
                    pairObservations[pair][nextIndex].price0Cumulative,
                    pairObservations[pair][nextIndex].timestamp.sub(pairObservations[pair][i].timestamp),
                    _amountIn
                );
            }
        } else {
            for (; i < length; i++) {
                nextIndex = i + 1;
                priceAverageCumulative += _computeAmountOut(
                    pairObservations[pair][i].price1Cumulative,
                    pairObservations[pair][nextIndex].price1Cumulative,
                    pairObservations[pair][nextIndex].timestamp.sub(pairObservations[pair][i].timestamp),
                    _amountIn
                );
            }
        }
    }

    /* ========== Owner functions ========== */

    /**
     * @notice Sets the period window
     */
    function setPeriodWindow(uint _periodWindow) external onlyOwner {
        require(_periodWindow != 0, "ArcUniswapV2Oracle::setPeriodWindow: period window cannot be 0!");

        periodWindow = _periodWindow;
        emit PeriodWindowSet(_periodWindow);
    }

    /**
     * @notice Sets the Keep3rV1 address
     */
    function setKeep3rAddress(address _kp3r) external onlyOwner {
        require(_kp3r != address(0), "ArcUniswapV2Oracle::setKeep3rAddress: _kp3r must not be null");

        KP3R = IKeep3rV1(_kp3r);
        emit Keep3rV1AddressSet(_kp3r);
    }

    /**
     * @notice Adds the pair to the known pairs. Will start updating the given pair
     * @dev the order doesn't matter because they are be sorted later down the road
     * @param _tokenA first token of the pair
     * @param _tokenB second token of the pair
     */
    function addPair(address _tokenA, address _tokenB) external onlyOwner {
        address pair = UniswapV2Library.pairFor(uniV2Factory, _tokenA, _tokenB);

        require(!_known[pair], "UniswapV2Oracle::addPair: already known");

        _known[pair] = true;
        _pairs.push(pair);

        // Add an observation
        (uint price0Cumulative, uint price1Cumulative, ) = UniswapV2OracleLibrary.currentCumulativePrices(pair);
        pairObservations[pair].push(Observation(block.timestamp, price0Cumulative, price1Cumulative));

        emit PairAdded(pair);
    }

    /**
     * @notice Removes a pair
     */
    function removePair(address _tokenA, address _tokenB) external onlyOwner {
        address pair = UniswapV2Library.pairFor(uniV2Factory, _tokenA, _tokenB);

        require(_known[pair], "UniswapV2Oracle::removePair: pair not added");

        // Remove the pair from the pairs array
        for (uint i = 0; i < _pairs.length; i++) {
            if (_pairs[i] == pair) {
                delete _pairs[i];
                _pairs[i] = _pairs[_pairs.length - 1];
                _pairs.length--;

                break;
            }
        }

        delete _known[pair];

        emit PairRemoved(pair);
    }

    /* ========== Internal Functions ========== */

    /**
     * @dev Updates the pair if within the time window
     * @param _pair The pair to update
     */
    function _update(address _pair) internal returns (bool) {
        // we only want to commit updates once per period (i.e. windowSize / granularity)
        uint timeElapsed = block.timestamp - lastObservation(_pair).timestamp;

        if (timeElapsed > periodWindow) {
            (uint price0Cumulative, uint price1Cumulative, ) = UniswapV2OracleLibrary.currentCumulativePrices(_pair);

            pairObservations[_pair].push(Observation(block.timestamp, price0Cumulative, price1Cumulative));

            return true;
        }

        return false;
    }

    /**
     * @dev Loops over all registered pairs and updates them
     */
    function _updateAll() internal returns (bool updated) {
        for (uint i = 0; i < _pairs.length; i++) {
            if (_update(_pairs[i])) {
                updated = true;
            }
        }
    }

    /**
     * @dev Checks wether the pair was updated within `age` time
     */
    function _valid(address _pair, uint _age) internal view returns (bool) {
        return block.timestamp.sub(lastObservation(_pair).timestamp) <= _age;
    }

    function _computeAmountOut(
        uint _priceCumulativeStart,
        uint _priceCumulativeEnd,
        uint _timeElapsed,
        uint _amountIn
    ) private pure returns (uint amountOut) {
        // overflow is desired.
        FixedPoint.uq112x112 memory priceAverage =
            FixedPoint.uq112x112(uint224((_priceCumulativeEnd - _priceCumulativeStart) / _timeElapsed));
        FixedPoint.uq144x112 memory priceAverageMultiplied = FixedPoint.mul(priceAverage, _amountIn);

        return FixedPoint.decode144(priceAverageMultiplied);
    }
}
