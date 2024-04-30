// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/* @title  MundoCryptoTokenLock
 * @notice MundoCryptoTokenLock allows the users to lock their wMCT tokens to increase their voting power
 *         for the governance. Users can lock their tokens for three different locking periods.
 *
 *         Locking for six months will increase their voting power of locked tokens by 2.
 *         Locking for one year will increase their voting power of locked tokens by 4.
 *         Locking for two years will increase their voting power of locked tokens by 10.
 *
 **/
contract MundoCryptoTokenLock is ReentrancyGuard {
    /// @dev using SafeERC20 library to handle token transfer.
    using SafeERC20 for IERC20;

    /// @dev Token used for locking.
    IERC20 public immutable lockingToken;

    /// @dev defining constants for locking periods.
    uint256 private constant LOCK_TIME_SIX_MONTHS = 182 * 1 days;
    uint256 private constant LOCK_TIME_ONE_YEARS = 365 * 1 days;
    uint256 private constant LOCK_TIME_TWO_YEARS = 730 * 1 days;

    /// @dev Revert with an error when user tries to deposit more tokens than their balance.
    error InsufficientBalance();
    /// @dev Revert with an error when user tries to withdraw tokens before lock period.
    error TooEarly();
    /// @dev Revert with an error when the input param is zero valued.
    error ZeroValuedParam();
    /// @dev Revert with an error when invalid period is given as input.
    error InvalidPeriod();
    /// @dev Revert when user tries to lock more tokens but the period is completed.
    error LockedPeriodCompleted();

    /**
     * @dev A LockingData specifies the amount locked and the
     *      unlock time for that particular amount.
     *
     *      amount      : is the amount of tokens locked.
     *      unlockTime  : is the unlock time of the tokens.
     */
    struct LockingData {
        uint256 amount;
        uint256 unlockTime;
    }

    /// @dev Tracks the user locking data for different period.
    mapping(address => mapping(uint256 => LockingData)) private userLockingData;

    /// @dev Emit an event when the user locks the token for certain period.
    /// @param account      The user account whose tokens are locked.
    /// @param amount       The amount of tokens to be locked.
    /// @param lockPeriod   The lock period for which the tokens the locked.
    event TokensLocked(
        address indexed account,
        uint256 amount,
        uint256 lockPeriod
    );
    /// @dev Emit an event when tokens are withdrawn after the locking period ends.
    /// @param account      The user account whose tokens are locked.
    /// @param amount       The amount of tokens that are locked.
    /// @param lockPeriod   The lock period for which the tokens were locked.
    /// @param currentTime  Current timestamp.
    event TokensWithdrawn(
        address indexed account,
        uint256 amount,
        uint256 lockPeriod,
        uint256 currentTime
    );

    /// @dev Set the ERC20 token which will be locked.
    /// @param _token The ERC20 token which will be locked.
    constructor(address _token) {
        // assign the token to the immutable variable.
        lockingToken = IERC20(_token);
    }

    /// @dev Allows the user to lock their tokens for a particular time period.
    /// @param amount   The amount of tokens to lock.
    /// @param period   The lock period for which the tokens are to be locked.
    function lockTokens(uint256 amount, uint256 period) external {
        // revert if user tries to lock zero tokens.
        if (amount == 0) revert ZeroValuedParam();

        // revert if user tries to lock tokens for invalid lock period.
        if (period > 3) revert InvalidPeriod();

        // revert if user tires to lock more tokens than their balance.
        if (amount > lockingToken.balanceOf(msg.sender))
            revert InsufficientBalance();

        LockingData storage s_lockingData = userLockingData[msg.sender][period];

        // if locking for the first time in a period, set the unlock time.
        // else just update the amount and keep the unlock period as it is.
        if (s_lockingData.amount == 0) {
            if (period == 0) {
                unchecked {
                    s_lockingData.unlockTime =
                        block.timestamp +
                        LOCK_TIME_SIX_MONTHS;
                }
            }
            if (period == 1) {
                unchecked {
                    s_lockingData.unlockTime =
                        block.timestamp +
                        LOCK_TIME_ONE_YEARS;
                }
            }
            if (period == 2) {
                unchecked {
                    s_lockingData.unlockTime =
                        block.timestamp +
                        LOCK_TIME_TWO_YEARS;
                }
            }
            // if user tries to lock tokens after the period ends, revert.
        } else {
            if (block.timestamp > s_lockingData.unlockTime)
                revert LockedPeriodCompleted();
        }

        // update the locking amount.
        s_lockingData.amount += amount;

        // Emit an event indicating tokens were locked.
        emit TokensLocked(msg.sender, amount, period);

        // Transfer the tokens from user to the contract.
        lockingToken.transferFrom(msg.sender, address(this), amount);
    }

    /// @dev Allows the user to withdraw their locked tokens after the lock period ends.
    /// @param period   The lock period for which the tokens were locked.
    function withdrawTokens(uint256 period) external nonReentrant {
        // revert if user tries to lock tokens for invalid lock period.
        if (period > 3) revert InvalidPeriod();

        LockingData memory m_lockingData = userLockingData[msg.sender][period];

        // Store the vars to use them later.
        uint256 unlockTime = m_lockingData.unlockTime;
        uint256 amount = m_lockingData.amount;

        // delete the user locking data.
        delete userLockingData[msg.sender][period];

        // if the user tries to withdraw tokens before the period ends, revert.
        if (unlockTime > block.timestamp) revert TooEarly();

        // Emit an event indicating tokens were withdrawn.
        emit TokensWithdrawn(msg.sender, amount, period, block.timestamp);

        // Transfer the tokens from the contract to the user.
        lockingToken.transfer(msg.sender, amount);
    }

    /// @dev External view function to fetch user locking data for a particular account and period.
    /// @param _account The account to fetch the data for.
    /// @param _period  The locking period to fetch the data for.
    /// @return LockingData The locking data of the user and period.
    function fetchUserLockData(
        address _account,
        uint256 _period
    ) external view returns (LockingData memory) {
        return userLockingData[_account][_period];
    }

    /// @dev Fetch the voting power of an account based on the tokens locked for certain periods.
    /// @param _account The account to fetch the data for.
    /// @return votingPower The total voting of the particular account.
    function getVotingPower(
        address _account
    ) external view returns (uint256 votingPower) {
        LockingData memory m_lockingDataPeriodOne = userLockingData[_account][
            0
        ];
        LockingData memory m_lockingDataPeriodTwo = userLockingData[_account][
            1
        ];
        LockingData memory m_lockingDataPeriodThree = userLockingData[_account][
            2
        ];

        // define the voting weights of different periods.
        uint256 periodOnePower;
        uint256 periodTwoPower;
        uint256 periodThreePower;

        // if the lock period is still ongoing, calculate the power, else is zero.
        if (m_lockingDataPeriodOne.unlockTime > block.timestamp) {
            unchecked {
                periodOnePower = m_lockingDataPeriodOne.amount * 2;
            }
        }

        if (m_lockingDataPeriodTwo.unlockTime > block.timestamp) {
            unchecked {
                periodTwoPower = m_lockingDataPeriodTwo.amount * 4;
            }
        }

        if (m_lockingDataPeriodThree.unlockTime > block.timestamp) {
            unchecked {
                periodThreePower = m_lockingDataPeriodThree.amount * 10;
            }
        }

        // sum of all the voting powers to get the final voting power.
        unchecked {
            votingPower = periodOnePower + periodTwoPower + periodThreePower;
        }
    }
}
