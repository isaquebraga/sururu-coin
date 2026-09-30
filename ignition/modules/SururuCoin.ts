import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("SururuCoinModule", (m) => {
  const fornecimentoInicial = m.getParameter("fornecimentoInicial", 82_000_000n);

  const sururuCoin = m.contract("SururuCoin", [fornecimentoInicial]);

  return { sururuCoin };
});
