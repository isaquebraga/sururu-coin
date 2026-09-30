# SururuCoin (SURU)

Token fungível no padrão ERC-20 desenvolvido para a atividade prática **Minha Criptomoeda**, da disciplina Tópicos Especiais em Sistemas de Informação (IFAL, Campus Maceió), com Hardhat 3, OpenZeppelin Contracts e ethers.js.

| Item | Valor |
| --- | --- |
| Nome e símbolo | SururuCoin (SURU) |
| Casas decimais | 18 |
| Fornecimento inicial | 82.000.000 SURU, creditados a quem faz o deploy |
| Controle de acesso | `Ownable`: só o dono pode chamar `mint` |

## Estrutura

```
contracts/SururuCoin.sol          contrato (ERC20 + Ownable da OpenZeppelin)
test/SururuCoin.ts                testes em TypeScript (Mocha, Chai e ethers.js)
ignition/modules/SururuCoin.ts    módulo de deploy do Hardhat Ignition
dapp/                             página de consulta de saldo (desafio extra)
hardhat.config.ts                 compilador, rede Sepolia e verificação no Etherscan
```

## Como rodar

Requisitos: Node.js 22 ou mais novo e a extensão MetaMask.

```shell
npm install
npx hardhat compile
npx hardhat test
```

### Deploy local (Caminho A)

```shell
npx hardhat node
```

Em outro terminal:

```shell
npx hardhat ignition deploy ignition/modules/SururuCoin.ts --network localhost
```

Se o `npx hardhat node` for reiniciado, repita o deploy com `--reset`.

### Deploy na Sepolia (Caminho B)

```shell
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat ignition deploy ignition/modules/SururuCoin.ts --network sepolia
```

Opcional, verificação do código-fonte no Etherscan:

```shell
npx hardhat keystore set ETHERSCAN_API_KEY
npx hardhat ignition verify chain-11155111
```

### Página de consulta de saldo

```shell
npm run dapp
```

Abra `http://localhost:5178` no navegador com a MetaMask, clique em **Conectar** e consulte qualquer endereço. O endereço do contrato é preenchido a partir do deploy do Ignition na rede conectada. Também é possível ler pelo nó local ou por um RPC público da Sepolia, sem carteira.

## Segurança

A URL do nó RPC, a chave privada e a chave do Etherscan ficam no Hardhat Keystore, criptografadas e fora do projeto. Nunca coloque chaves no código nem use carteiras com fundos reais para testes.
