const {
	loadFixture,
	time,
} = require('@nomicfoundation/hardhat-network-helpers')
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs')
const { expect } = require('chai')
const { ethers } = require('hardhat')

const periodOne = 0
const periodTwo = 1
const periodThree = 2

const lockTimeOne = 15724800
const lockTimeTwo = 31536000
const lockTimeThree = 63072000

describe.only('MundoCryptoTokenLock', function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	async function deployMundoCryptoTokenLockFixture() {
		// Contracts are deployed using the first signer/account by default
		const [owner, alice, bob, charlie] = await ethers.getSigners()

		const MockToken = await ethers.getContractFactory('MockToken')
		const mockToken = await MockToken.deploy()

		const WrappedMundoCryptoToken = await ethers.getContractFactory(
			'WrappedMundoCryptoToken'
		)
		const wToken = await WrappedMundoCryptoToken.deploy(mockToken.address)

		const MundoCryptoTokenLock = await ethers.getContractFactory(
			'MundoCryptoTokenLock'
		)
		const lock = await MundoCryptoTokenLock.deploy(wToken.address)

		const aliceAmt = ethers.utils.parseEther('1000')
		const bobAmt = ethers.utils.parseEther('10000')
		const charlieAmt = ethers.utils.parseEther('100000')

		// mint tokens to users
		await mockToken.mint(alice.address, aliceAmt)
		await mockToken.mint(bob.address, bobAmt)
		await mockToken.mint(charlie.address, charlieAmt)

		// necessary approvals
		await mockToken.connect(alice).approve(wToken.address, aliceAmt)
		await mockToken.connect(bob).approve(wToken.address, bobAmt)
		await mockToken.connect(charlie).approve(wToken.address, charlieAmt)

		await wToken.connect(alice).approve(lock.address, aliceAmt)
		await wToken.connect(bob).approve(lock.address, bobAmt)
		await wToken.connect(charlie).approve(lock.address, charlieAmt)

		// users will get wrapped tokens
		await wToken.connect(alice).depositFor(alice.address, aliceAmt)
		await wToken.connect(bob).depositFor(bob.address, bobAmt)
		await wToken.connect(charlie).depositFor(charlie.address, charlieAmt)

		return {
			mockToken,
			wToken,
			lock,
			owner,
			alice,
			bob,
			charlie,
			aliceAmt,
			bobAmt,
			charlieAmt,
		}
	}

	describe('Deployment', () => {
		it('Should set the right locking token', async () => {
			const { wToken, lock } = await loadFixture(
				deployMundoCryptoTokenLockFixture
			)

			expect(await lock.lockingToken()).to.equal(wToken.address)
		})
	})

	describe('Lock Tokens', () => {
		it('Should allow the users to lock tokens', async () => {
			const {
				wToken,
				alice,
				aliceAmt,
				bob,
				bobAmt,
				charlie,
				charlieAmt,
				lock,
			} = await loadFixture(deployMundoCryptoTokenLockFixture)

			await expect(
				lock.connect(alice).lockTokens(aliceAmt, periodOne)
			).to.changeTokenBalances(
				wToken,
				[lock, alice],
				[aliceAmt, aliceAmt.mul(-1)]
			)

			const aliceUnlockTime = (await time.latest()) + lockTimeOne

			await expect(
				lock.connect(bob).lockTokens(bobAmt, periodTwo)
			).to.changeTokenBalances(
				wToken,
				[lock, bob],
				[bobAmt, bobAmt.mul(-1)]
			)

			const bobUnlockTime = (await time.latest()) + lockTimeTwo

			await expect(
				lock.connect(charlie).lockTokens(charlieAmt, periodThree)
			).to.changeTokenBalances(
				wToken,
				[lock, charlie],
				[charlieAmt, charlieAmt.mul(-1)]
			)

			const charlieUnlockTime = (await time.latest()) + lockTimeThree

			const aliceData = await lock.fetchUserLockData(
				alice.address,
				periodOne
			)
			const bobData = await lock.fetchUserLockData(bob.address, periodTwo)
			const charlieData = await lock.fetchUserLockData(
				charlie.address,
				periodThree
			)

			expect(aliceData.amount).to.be.equal(aliceAmt)
			expect(aliceData.unlockTime).to.be.equal(aliceUnlockTime)
			expect(bobData.amount).to.be.equal(bobAmt)
			expect(bobData.unlockTime).to.be.equal(bobUnlockTime)
			expect(charlieData.amount).to.be.equal(charlieAmt)
			expect(charlieData.unlockTime).to.be.equal(charlieUnlockTime)
		})

		it('Should emit an event when someone locks their tokens', async () => {
			const { alice, aliceAmt, lock } = await loadFixture(
				deployMundoCryptoTokenLockFixture
			)

			const tx = lock.connect(alice).lockTokens(aliceAmt, periodOne)

			await expect(tx)
				.to.emit(lock, 'TokensLocked')
				.withArgs(alice.address, aliceAmt, periodOne)
		})

		it('Should not allow users to lock zero tokens', async () => {
			const { alice, lock } = await loadFixture(
				deployMundoCryptoTokenLockFixture
			)

			await expect(
				lock.connect(alice).lockTokens(0, periodOne)
			).to.be.revertedWithCustomError(lock, 'ZeroValuedParam')
		})

		it('Should not allow users to define invalid lock period', async () => {
			const { alice, aliceAmt, lock } = await loadFixture(
				deployMundoCryptoTokenLockFixture
			)

			await expect(
				lock.connect(alice).lockTokens(aliceAmt, 4)
			).to.be.revertedWithCustomError(lock, 'InvalidPeriod')
		})

		it('Should not allow users to lock more tokens then their balance', async () => {
			const { alice, aliceAmt, lock } = await loadFixture(
				deployMundoCryptoTokenLockFixture
			)

			await expect(
				lock.connect(alice).lockTokens(aliceAmt.mul(2), periodOne)
			).to.be.revertedWithCustomError(lock, 'InsufficientBalance')
		})

		it('Should allow users to lock more tokens in their current period', async () => {
			const { alice, aliceAmt, lock } = await loadFixture(
				deployMundoCryptoTokenLockFixture
			)

			const initialAmt = aliceAmt.div(2)
			const newAmt = aliceAmt.div(4)

			await lock.connect(alice).lockTokens(initialAmt, periodOne)

			const aliceUnlockTime = (await time.latest()) + lockTimeOne

			await lock.connect(alice).lockTokens(newAmt, periodOne)

			const aliceData = await lock.fetchUserLockData(
				alice.address,
				periodOne
			)

			expect(aliceData.amount).to.be.equal(initialAmt.add(newAmt))
			expect(aliceData.unlockTime).to.be.equal(aliceUnlockTime)
		})

		it('Should allow users to lock tokens in all periods', async () => {
			const { alice, aliceAmt, lock } = await loadFixture(
				deployMundoCryptoTokenLockFixture
			)

			const periodOneAmt = aliceAmt.div(6)
			const periodTwoAmt = aliceAmt.div(2)
			const periodThreeAmt = aliceAmt.div(4)

			await lock.connect(alice).lockTokens(periodOneAmt, periodOne)
			const aliceUnlockTimeOne = (await time.latest()) + lockTimeOne

			await lock.connect(alice).lockTokens(periodTwoAmt, periodTwo)
			const aliceUnlockTimeTwo = (await time.latest()) + lockTimeTwo

			await lock.connect(alice).lockTokens(periodThreeAmt, periodThree)
			const aliceUnlockTimeThree = (await time.latest()) + lockTimeThree

			const aliceDataOne = await lock.fetchUserLockData(
				alice.address,
				periodOne
			)
			expect(aliceDataOne.amount).to.be.equal(periodOneAmt)
			expect(aliceDataOne.unlockTime).to.be.equal(aliceUnlockTimeOne)

			const aliceDataTwo = await lock.fetchUserLockData(
				alice.address,
				periodTwo
			)
			expect(aliceDataTwo.amount).to.be.equal(periodTwoAmt)
			expect(aliceDataTwo.unlockTime).to.be.equal(aliceUnlockTimeTwo)

			const aliceDataThree = await lock.fetchUserLockData(
				alice.address,
				periodThree
			)
			expect(aliceDataThree.amount).to.be.equal(periodThreeAmt)
			expect(aliceDataThree.unlockTime).to.be.equal(aliceUnlockTimeThree)
		})

		it('Should not allow users to lock more tokens after lock period is over', async () => {
			const { alice, aliceAmt, lock } = await loadFixture(
				deployMundoCryptoTokenLockFixture
			)

			await lock.connect(alice).lockTokens(aliceAmt.sub(1), periodOne)

			await time.increase(lockTimeOne)

			await expect(
				lock.connect(alice).lockTokens(1, periodOne)
			).to.be.revertedWithCustomError(lock, 'LockedPeriodCompleted')
		})
	})

	describe('Withdraw Tokens', () => {
		it('Should allow the users to withdraw locked tokens', async () => {
			const { wToken, bob, bobAmt, lock } = await loadFixture(
				deployMundoCryptoTokenLockFixture
			)

			await lock.connect(bob).lockTokens(bobAmt, periodTwo)

			const bobUnlockTime = (await time.latest()) + lockTimeTwo

			await time.increaseTo(bobUnlockTime)

			await expect(
				lock.connect(bob).withdrawTokens(periodTwo)
			).to.changeTokenBalances(
				wToken,
				[bob, lock],
				[bobAmt, bobAmt.mul(-1)]
			)

			const bobData = await lock.fetchUserLockData(bob.address, periodTwo)

			expect(bobData.amount).to.be.equal(0)
			expect(bobData.unlockTime).to.be.equal(0)
		})

		it('Should emit event when someone withdraws thier locked tokens', async () => {
			const { alice, aliceAmt, lock } = await loadFixture(
				deployMundoCryptoTokenLockFixture
			)

			await lock.connect(alice).lockTokens(aliceAmt, periodOne)
			const aliceUnlockTime = (await time.latest()) + lockTimeOne

			await time.increaseTo(aliceUnlockTime)

			const tx = lock.connect(alice).withdrawTokens(periodOne)

			await expect(tx)
				.to.emit(lock, 'TokensWithdrawn')
				.withArgs(alice.address, aliceAmt, periodOne, anyValue)
		})

		it('Should not allow users to define invalid lock period while withdrawing', async () => {
			const { bob, bobAmt, lock } = await loadFixture(
				deployMundoCryptoTokenLockFixture
			)

			await expect(
				lock.connect(bob).lockTokens(bobAmt, 4)
			).to.be.revertedWithCustomError(lock, 'InvalidPeriod')
		})

		it('Should not allow users to withdraw before lock period is over', async () => {
			const { charlie, charlieAmt, lock } = await loadFixture(
				deployMundoCryptoTokenLockFixture
			)

			await lock.connect(charlie).lockTokens(charlieAmt, periodThree)

			await expect(
				lock.connect(charlie).withdrawTokens(periodThree)
			).to.be.revertedWithCustomError(lock, 'TooEarly')
		})
	})

	describe('Voting Power', () => {
		describe('Before locking period ends', () => {
			it('Should compute proper voting power for lock period one', async () => {
				const { alice, aliceAmt, lock } = await loadFixture(
					deployMundoCryptoTokenLockFixture
				)

				await lock.connect(alice).lockTokens(aliceAmt, periodOne)

				const aliceVotingPower = await lock.getVotingPower(
					alice.address
				)

				expect(aliceVotingPower).to.be.equal(aliceAmt.mul(2))
			})

			it('Should compute proper voting power for lock period two', async () => {
				const { bob, bobAmt, lock } = await loadFixture(
					deployMundoCryptoTokenLockFixture
				)

				await lock.connect(bob).lockTokens(bobAmt, periodTwo)

				const bobVotingPower = await lock.getVotingPower(bob.address)

				expect(bobVotingPower).to.be.equal(bobAmt.mul(4))
			})

			it('Should compute proper voting power for lock period three', async () => {
				const { charlie, charlieAmt, lock } = await loadFixture(
					deployMundoCryptoTokenLockFixture
				)

				await lock.connect(charlie).lockTokens(charlieAmt, periodThree)

				const charlieVotingPower = await lock.getVotingPower(
					charlie.address
				)

				expect(charlieVotingPower).to.be.equal(charlieAmt.mul(10))
			})

			it('Should compute proper voting power for lock period one and two', async () => {
				const { wToken, alice, aliceAmt, bob, bobAmt, lock } =
					await loadFixture(deployMundoCryptoTokenLockFixture)

				await wToken.connect(bob).transfer(alice.address, bobAmt)
				await wToken
					.connect(alice)
					.approve(lock.address, aliceAmt.add(bobAmt))

				await lock.connect(alice).lockTokens(aliceAmt, periodOne)
				await lock.connect(alice).lockTokens(bobAmt, periodTwo)

				const aliceVotingPower = await lock.getVotingPower(
					alice.address
				)

				expect(aliceVotingPower).to.be.equal(
					aliceAmt.mul(2).add(bobAmt.mul(4))
				)
			})

			it('Should compute proper voting power for lock period two and three', async () => {
				const { wToken, bob, bobAmt, charlie, charlieAmt, lock } =
					await loadFixture(deployMundoCryptoTokenLockFixture)

				await wToken.connect(bob).transfer(charlie.address, bobAmt)
				await wToken
					.connect(charlie)
					.approve(lock.address, bobAmt.add(charlieAmt))

				await lock.connect(charlie).lockTokens(bobAmt, periodTwo)
				await lock.connect(charlie).lockTokens(charlieAmt, periodThree)

				const charlieVotingPower = await lock.getVotingPower(
					charlie.address
				)

				expect(charlieVotingPower).to.be.equal(
					bobAmt.mul(4).add(charlieAmt.mul(10))
				)
			})

			it('Should compute proper voting power for lock period one and three', async () => {
				const { wToken, bob, bobAmt, charlie, charlieAmt, lock } =
					await loadFixture(deployMundoCryptoTokenLockFixture)

				await wToken.connect(charlie).transfer(bob.address, charlieAmt)
				await wToken
					.connect(bob)
					.approve(lock.address, bobAmt.add(charlieAmt))

				await lock.connect(bob).lockTokens(bobAmt, periodOne)
				await lock.connect(bob).lockTokens(charlieAmt, periodThree)

				const bobVotingPower = await lock.getVotingPower(bob.address)

				expect(bobVotingPower).to.be.equal(
					bobAmt.mul(2).add(charlieAmt.mul(10))
				)
			})

			it('Should compute proper voting power for lock period one two and three', async () => {
				const {
					wToken,
					alice,
					aliceAmt,
					bob,
					bobAmt,
					charlie,
					charlieAmt,
					lock,
				} = await loadFixture(deployMundoCryptoTokenLockFixture)

				await wToken.connect(bob).transfer(alice.address, bobAmt)
				await wToken
					.connect(charlie)
					.transfer(alice.address, charlieAmt)
				await wToken
					.connect(alice)
					.approve(lock.address, aliceAmt.add(bobAmt.add(charlieAmt)))

				await lock.connect(alice).lockTokens(aliceAmt, periodOne)
				await lock.connect(alice).lockTokens(bobAmt, periodTwo)
				await lock.connect(alice).lockTokens(charlieAmt, periodThree)

				const aliceVotingPower = await lock.getVotingPower(
					alice.address
				)

				expect(aliceVotingPower).to.be.equal(
					aliceAmt.mul(2).add(bobAmt.mul(4).add(charlieAmt.mul(10)))
				)
			})
		})

		describe('After locking period ends', () => {
			it('Should compute proper voting power for lock period one', async () => {
				const { alice, aliceAmt, lock } = await loadFixture(
					deployMundoCryptoTokenLockFixture
				)

				await lock.connect(alice).lockTokens(aliceAmt, periodOne)
				const aliceUnlockTime = (await time.latest()) + lockTimeOne

				await time.increaseTo(aliceUnlockTime)

				const aliceVotingPower = await lock.getVotingPower(
					alice.address
				)

				expect(aliceVotingPower).to.be.equal(0)
			})

			it('Should compute proper voting power for lock period two', async () => {
				const { bob, bobAmt, lock } = await loadFixture(
					deployMundoCryptoTokenLockFixture
				)

				await lock.connect(bob).lockTokens(bobAmt, periodTwo)
				const bobUnlockTime = (await time.latest()) + lockTimeThree

				await time.increaseTo(bobUnlockTime)

				const bobVotingPower = await lock.getVotingPower(bob.address)

				expect(bobVotingPower).to.be.equal(0)
			})

			it('Should compute proper voting power for lock period three', async () => {
				const { charlie, charlieAmt, lock } = await loadFixture(
					deployMundoCryptoTokenLockFixture
				)

				await lock.connect(charlie).lockTokens(charlieAmt, periodThree)
				const charlieUnlockTime = (await time.latest()) + lockTimeThree

				await time.increaseTo(charlieUnlockTime)

				const charlieVotingPower = await lock.getVotingPower(
					charlie.address
				)

				expect(charlieVotingPower).to.be.equal(0)
			})

			it('Should compute proper voting power for lock period one and two', async () => {
				const { wToken, alice, aliceAmt, bob, bobAmt, lock } =
					await loadFixture(deployMundoCryptoTokenLockFixture)

				await wToken.connect(bob).transfer(alice.address, bobAmt)
				await wToken
					.connect(alice)
					.approve(lock.address, aliceAmt.add(bobAmt))

				await lock.connect(alice).lockTokens(aliceAmt, periodOne)
				await lock.connect(alice).lockTokens(bobAmt, periodTwo)
				const aliceUnlockTime = (await time.latest()) + lockTimeThree

				await time.increaseTo(aliceUnlockTime)

				const aliceVotingPower = await lock.getVotingPower(
					alice.address
				)

				expect(aliceVotingPower).to.be.equal(0)
			})

			it('Should compute proper voting power for lock period two and three', async () => {
				const { wToken, bob, bobAmt, charlie, charlieAmt, lock } =
					await loadFixture(deployMundoCryptoTokenLockFixture)

				await wToken.connect(bob).transfer(charlie.address, bobAmt)
				await wToken
					.connect(charlie)
					.approve(lock.address, bobAmt.add(charlieAmt))

				await lock.connect(charlie).lockTokens(bobAmt, periodTwo)
				await lock.connect(charlie).lockTokens(charlieAmt, periodThree)
				const charlieUnlockTime = (await time.latest()) + lockTimeThree

				await time.increaseTo(charlieUnlockTime)

				const charlieVotingPower = await lock.getVotingPower(
					charlie.address
				)

				expect(charlieVotingPower).to.be.equal(0)
			})

			it('Should compute proper voting power for lock period one and three', async () => {
				const { wToken, bob, bobAmt, charlie, charlieAmt, lock } =
					await loadFixture(deployMundoCryptoTokenLockFixture)

				await wToken.connect(charlie).transfer(bob.address, charlieAmt)
				await wToken
					.connect(bob)
					.approve(lock.address, bobAmt.add(charlieAmt))

				await lock.connect(bob).lockTokens(bobAmt, periodTwo)
				await lock.connect(bob).lockTokens(charlieAmt, periodThree)
				const bobUnlockTime = (await time.latest()) + lockTimeThree

				await time.increaseTo(bobUnlockTime)

				const bobVotingPower = await lock.getVotingPower(bob.address)

				expect(bobVotingPower).to.be.equal(0)
			})

			it('Should compute proper voting power for lock period one two and three', async () => {
				const {
					wToken,
					alice,
					aliceAmt,
					bob,
					bobAmt,
					charlie,
					charlieAmt,
					lock,
				} = await loadFixture(deployMundoCryptoTokenLockFixture)

				await wToken.connect(bob).transfer(alice.address, bobAmt)
				await wToken
					.connect(charlie)
					.transfer(alice.address, charlieAmt)
				await wToken
					.connect(alice)
					.approve(lock.address, aliceAmt.add(bobAmt.add(charlieAmt)))

				await lock.connect(alice).lockTokens(aliceAmt, periodOne)
				await lock.connect(alice).lockTokens(bobAmt, periodTwo)
				await lock.connect(alice).lockTokens(charlieAmt, periodThree)
				const aliceUnlockTime = (await time.latest()) + lockTimeThree

				await time.increaseTo(aliceUnlockTime)

				const aliceVotingPower = await lock.getVotingPower(
					alice.address
				)

				expect(aliceVotingPower).to.be.equal(0)
			})
		})

		describe('After certain locking period ends', () => {
			it('Should compute proper voting power when lock period one ends and two is ongoing', async () => {
				const { wToken, alice, aliceAmt, bob, bobAmt, lock } =
					await loadFixture(deployMundoCryptoTokenLockFixture)

				await wToken.connect(bob).transfer(alice.address, bobAmt)
				await wToken
					.connect(alice)
					.approve(lock.address, aliceAmt.add(bobAmt))

				await lock.connect(alice).lockTokens(aliceAmt, periodOne)
				await lock.connect(alice).lockTokens(bobAmt, periodTwo)
				const aliceUnlockTime = (await time.latest()) + lockTimeOne

				await time.increaseTo(aliceUnlockTime)

				const aliceVotingPower = await lock.getVotingPower(
					alice.address
				)

				expect(aliceVotingPower).to.be.equal(bobAmt.mul(4))
			})

			it('Should compute proper voting power when lock period two ends and three is ongoing', async () => {
				const { wToken, bob, bobAmt, charlie, charlieAmt, lock } =
					await loadFixture(deployMundoCryptoTokenLockFixture)

				await wToken.connect(bob).transfer(charlie.address, bobAmt)
				await wToken
					.connect(charlie)
					.approve(lock.address, bobAmt.add(charlieAmt))

				await lock.connect(charlie).lockTokens(bobAmt, periodTwo)
				await lock.connect(charlie).lockTokens(charlieAmt, periodThree)
				const charlieUnlockTime = (await time.latest()) + lockTimeTwo

				await time.increaseTo(charlieUnlockTime)

				const charlieVotingPower = await lock.getVotingPower(
					charlie.address
				)

				expect(charlieVotingPower).to.be.equal(charlieAmt.mul(10))
			})

			it('Should compute proper voting power when lock period one ends and three is ongoing', async () => {
				const { wToken, bob, bobAmt, charlie, charlieAmt, lock } =
					await loadFixture(deployMundoCryptoTokenLockFixture)

				await wToken.connect(charlie).transfer(bob.address, charlieAmt)
				await wToken
					.connect(bob)
					.approve(lock.address, bobAmt.add(charlieAmt))

				await lock.connect(bob).lockTokens(bobAmt, periodOne)
				await lock.connect(bob).lockTokens(charlieAmt, periodThree)
				const bobUnlockTime = (await time.latest()) + lockTimeOne

				await time.increaseTo(bobUnlockTime)

				const bobVotingPower = await lock.getVotingPower(bob.address)

				expect(bobVotingPower).to.be.equal(charlieAmt.mul(10))
			})

			it('Should compute proper voting power when lock period one ends and two and three are ongoing ', async () => {
				const {
					wToken,
					alice,
					aliceAmt,
					bob,
					bobAmt,
					charlie,
					charlieAmt,
					lock,
				} = await loadFixture(deployMundoCryptoTokenLockFixture)

				await wToken.connect(bob).transfer(alice.address, bobAmt)
				await wToken
					.connect(charlie)
					.transfer(alice.address, charlieAmt)
				await wToken
					.connect(alice)
					.approve(lock.address, aliceAmt.add(bobAmt.add(charlieAmt)))

				await lock.connect(alice).lockTokens(aliceAmt, periodOne)
				await lock.connect(alice).lockTokens(bobAmt, periodTwo)
				await lock.connect(alice).lockTokens(charlieAmt, periodThree)
				const aliceUnlockTime = (await time.latest()) + lockTimeOne

				await time.increaseTo(aliceUnlockTime)

				const aliceVotingPower = await lock.getVotingPower(
					alice.address
				)

				expect(aliceVotingPower).to.be.equal(
					bobAmt.mul(4).add(charlieAmt.mul(10))
				)
			})
		})
	})
})
