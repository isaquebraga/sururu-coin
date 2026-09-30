import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const FORNECIMENTO_INICIAL = 82_000_000n;

describe("SururuCoin", function () {
  async function implantarFixture() {
    const [dono, outraConta, terceiraConta] = await ethers.getSigners();
    const token = await ethers.deployContract("SururuCoin", [FORNECIMENTO_INICIAL]);
    const umSuru = 10n ** (await token.decimals());
    return { token, dono, outraConta, terceiraConta, umSuru };
  }

  describe("Implantação", function () {
    it("tem o nome e o símbolo corretos", async function () {
      const { token } = await networkHelpers.loadFixture(implantarFixture);
      expect(await token.name()).to.equal("SururuCoin");
      expect(await token.symbol()).to.equal("SURU");
    });

    it("usa 18 casas decimais, como o ETH", async function () {
      const { token } = await networkHelpers.loadFixture(implantarFixture);
      expect(await token.decimals()).to.equal(18n);
    });

    it("credita todo o fornecimento inicial ao dono", async function () {
      const { token, dono, umSuru } = await networkHelpers.loadFixture(implantarFixture);
      const saldoDono = await token.balanceOf(dono.address);
      expect(await token.totalSupply()).to.equal(saldoDono);
      expect(saldoDono).to.equal(FORNECIMENTO_INICIAL * umSuru);
    });

    it("define quem fez o deploy como dono do contrato", async function () {
      const { token, dono } = await networkHelpers.loadFixture(implantarFixture);
      expect(await token.owner()).to.equal(dono.address);
    });
  });

  describe("Transferências", function () {
    it("permite transferir tokens entre contas", async function () {
      const { token, dono, outraConta, umSuru } =
        await networkHelpers.loadFixture(implantarFixture);
      const valor = 100n * umSuru;
      await expect(token.transfer(outraConta.address, valor)).to.changeTokenBalances(
        ethers,
        token,
        [dono, outraConta],
        [-valor, valor],
      );
      expect(await token.balanceOf(outraConta.address)).to.equal(valor);
    });

    it("emite o evento Transfer", async function () {
      const { token, dono, outraConta, umSuru } =
        await networkHelpers.loadFixture(implantarFixture);
      const valor = 10n * umSuru;
      await expect(token.transfer(outraConta.address, valor))
        .to.emit(token, "Transfer")
        .withArgs(dono.address, outraConta.address, valor);
    });

    it("impede transferir mais do que o saldo", async function () {
      const { token, dono, outraConta } = await networkHelpers.loadFixture(implantarFixture);
      await expect(token.connect(outraConta).transfer(dono.address, 1n))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
        .withArgs(outraConta.address, 0n, 1n);
    });

    it("permite gastar tokens de outra conta com approve e transferFrom", async function () {
      const { token, dono, outraConta, terceiraConta, umSuru } =
        await networkHelpers.loadFixture(implantarFixture);
      const valor = 50n * umSuru;
      await expect(token.approve(outraConta.address, valor))
        .to.emit(token, "Approval")
        .withArgs(dono.address, outraConta.address, valor);
      expect(await token.allowance(dono.address, outraConta.address)).to.equal(valor);

      await token.connect(outraConta).transferFrom(dono.address, terceiraConta.address, valor);
      expect(await token.balanceOf(terceiraConta.address)).to.equal(valor);
      expect(await token.allowance(dono.address, outraConta.address)).to.equal(0n);
    });
  });

  describe("Emissão de novos tokens (mint)", function () {
    it("permite que o dono crie novos tokens", async function () {
      const { token, outraConta, umSuru } = await networkHelpers.loadFixture(implantarFixture);
      await expect(token.mint(outraConta.address, 500n))
        .to.emit(token, "Transfer")
        .withArgs(ethers.ZeroAddress, outraConta.address, 500n * umSuru);
      expect(await token.balanceOf(outraConta.address)).to.equal(500n * umSuru);
      expect(await token.totalSupply()).to.equal((FORNECIMENTO_INICIAL + 500n) * umSuru);
    });

    it("impede que outra conta faça mint", async function () {
      const { token, outraConta } = await networkHelpers.loadFixture(implantarFixture);
      await expect(token.connect(outraConta).mint(outraConta.address, 100n))
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(outraConta.address);
    });
  });
});
