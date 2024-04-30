// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("", "") {}

    function mint(address _receiver, uint256 _value) external {
        _mint(_receiver, _value);
    }
}
