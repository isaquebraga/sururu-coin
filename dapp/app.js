"use strict";

const ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address conta) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

const ENDERECOS_CONHECIDOS = {};

const RPCS = {
  local: { url: "http://127.0.0.1:8545", chainId: 31337 },
  sepolia: { url: "https://ethereum-sepolia-rpc.publicnode.com", chainId: 11155111 },
};

const NOMES_DAS_REDES = { 1: "Ethereum Mainnet", 11155111: "Sepolia", 31337: "Hardhat Local" };
const CHAVE_DO_MODULO = "SururuCoinModule#SururuCoin";
const TEMPO_LIMITE_MS = 15000;

const MENSAGENS = {
  semEthers: "Não foi possível carregar a biblioteca ethers.js. Confira a internet e recarregue a página.",
  semMetaMask: "MetaMask não encontrada neste navegador. Instale a extensão ou escolha outra forma de leitura.",
  metamaskParada: "A MetaMask não respondeu. Abra a extensão e veja se há um pedido pendente.",
  noLocalParado: "O nó local não respondeu. Rode npx hardhat node em outro terminal e tente de novo.",
  rpcPublicoParado: "O RPC público da Sepolia não respondeu. Tente de novo ou use a MetaMask.",
  semResposta: "A rede não respondeu a tempo. Tente de novo.",
  contratoInvalido: "Endereço do contrato inválido: use 0x seguido de 40 caracteres hexadecimais.",
  enderecoInvalido: "Endereço a consultar inválido: use 0x seguido de 40 caracteres hexadecimais.",
  recusado: "A conexão foi recusada na MetaMask. Clique em Conectar e aprove o acesso.",
  pedidoPendente: "Já existe um pedido de conexão aberto na MetaMask. Abra a extensão e responda a ele.",
  naoErc20: "Há um contrato nesse endereço, mas ele não respondeu como um token ERC-20.",
  semRede: "Não foi possível falar com a rede. Confira a forma de leitura escolhida e tente de novo.",
};

const $ = (id) => document.getElementById(id);

const estado = {
  modo: null,
  provider: null,
  chainId: null,
  conta: null,
  contrato: null,
  alvo: null,
  simbolo: "",
  casas: 18n,
  total: 0n,
  saldo: null,
};

function comTempoLimite(promessa, mensagem = MENSAGENS.semResposta, ms = TEMPO_LIMITE_MS) {
  let relogio;
  const limite = new Promise((_, rejeitar) => {
    relogio = setTimeout(() => rejeitar(new Error(mensagem)), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(relogio));
}

function nomeDaRede(chainId) {
  return NOMES_DAS_REDES[chainId] ?? `de chain ID ${chainId}`;
}

function abreviar(endereco) {
  return `${endereco.slice(0, 6)}…${endereco.slice(-4)}`;
}

function mensagemSemContrato(endereco) {
  return `Não existe contrato em ${abreviar(endereco)} na rede ${nomeDaRede(estado.chainId)}. ` +
    "Confira se a leitura está na mesma rede em que o token foi implantado.";
}

function formatarQuantidade(valor, casas) {
  const [inteira, fracao = ""] = ethers.formatUnits(valor, casas).split(".");
  const fracaoUtil = fracao.replace(/0+$/, "");
  const inteiraBR = BigInt(inteira).toLocaleString("pt-BR");
  return fracaoUtil ? `${inteiraBR},${fracaoUtil}` : inteiraBR;
}

function formatarParticipacao(saldo, total) {
  if (total === 0n) return "";
  if (saldo === 0n) return "0% do fornecimento total";
  const centesimos = (saldo * 10000n) / total;
  if (centesimos === 0n) return "Menos de 0,01% do fornecimento total";
  const inteiro = centesimos / 100n;
  const decimal = (centesimos % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return `${inteiro}${decimal ? "," + decimal : ""}% do fornecimento total`;
}

function traduzirErro(erro) {
  const codigo = erro?.code ?? erro?.error?.code ?? erro?.info?.error?.code;
  if (codigo === 4001 || codigo === "ACTION_REJECTED") return MENSAGENS.recusado;
  if (codigo === -32002) return MENSAGENS.pedidoPendente;
  if (codigo === "CALL_EXCEPTION" || codigo === "BAD_DATA") return MENSAGENS.naoErc20;
  if (["NETWORK_ERROR", "SERVER_ERROR", "TIMEOUT"].includes(codigo)) return MENSAGENS.semRede;
  return erro?.shortMessage ?? erro?.message ?? String(erro);
}

function mostrarErro(mensagem) {
  const caixa = $("erro");
  caixa.textContent = mensagem ?? "";
  caixa.hidden = !mensagem;
}

function definirOcupado(ocupado) {
  for (const id of ["botao-conectar", "botao-consultar", "botao-minha-conta", "botao-metamask"]) {
    $(id).disabled = ocupado;
  }
  document.body.setAttribute("aria-busy", String(ocupado));
}

function acao(funcao) {
  return async (evento) => {
    evento?.preventDefault?.();
    mostrarErro("");
    definirOcupado(true);
    try {
      await funcao();
    } catch (erro) {
      console.error(erro);
      mostrarErro(traduzirErro(erro));
    } finally {
      definirOcupado(false);
    }
  };
}

function atualizarStatus() {
  let texto = `Conectado à rede ${nomeDaRede(estado.chainId)} (chain ID ${estado.chainId})`;
  if (estado.conta) texto += `, conta ${abreviar(estado.conta)}`;
  texto += ".";
  if (estado.modo === "metamask" && ![31337, 11155111].includes(estado.chainId)) {
    texto += " Para ler a SururuCoin, troque a MetaMask para Sepolia ou Hardhat Local.";
  }
  $("status").textContent = texto;
}

async function conectar() {
  const modo = $("modo").value;
  await pararDeOuvir();
  estado.provider?.destroy();
  Object.assign(estado, { provider: null, contrato: null, conta: null });
  $("resultado").hidden = true;
  $("token").hidden = true;

  let provider;
  let conta = null;
  if (modo === "metamask") {
    if (!window.ethereum) throw new Error(MENSAGENS.semMetaMask);
    provider = new ethers.BrowserProvider(window.ethereum);
    await comTempoLimite(
      provider.send("eth_requestAccounts", []),
      MENSAGENS.metamaskParada,
      120000,
    );
    const signer = await provider.getSigner();
    conta = await signer.getAddress();
  } else {
    const { url, chainId } = RPCS[modo];
    const rede = ethers.Network.from(chainId);
    provider = new ethers.JsonRpcProvider(url, rede, { staticNetwork: rede });
    try {
      await comTempoLimite(provider.getBlockNumber());
    } catch {
      provider.destroy();
      throw new Error(modo === "local" ? MENSAGENS.noLocalParado : MENSAGENS.rpcPublicoParado);
    }
  }

  const rede = await comTempoLimite(provider.getNetwork());
  Object.assign(estado, { modo, provider, conta, chainId: Number(rede.chainId) });
  atualizarStatus();
  await preencherEnderecoDoContrato();
}

async function preencherEnderecoDoContrato() {
  const campo = $("contrato");
  const dica = $("dica-contrato");
  if (campo.value.trim() !== "" && campo.dataset.automatico !== "sim") return;

  let endereco = ENDERECOS_CONHECIDOS[estado.chainId] ?? null;
  let origem = "definido em app.js";
  if (!endereco) {
    try {
      const resposta = await fetch(`implantacoes/chain-${estado.chainId}.json`, { cache: "no-store" });
      if (resposta.ok) {
        endereco = (await resposta.json())[CHAVE_DO_MODULO] ?? null;
        origem = "lido do deploy do Hardhat Ignition nesta rede";
      }
    } catch {}
  }

  if (endereco) {
    campo.value = endereco;
    campo.dataset.automatico = "sim";
    dica.textContent = `Preenchido automaticamente (${origem}).`;
  } else {
    if (campo.dataset.automatico === "sim") campo.value = "";
    delete campo.dataset.automatico;
    dica.textContent = "Cole o endereço que o Hardhat Ignition mostrou no deploy.";
  }
}

async function consultar() {
  const enderecoContrato = $("contrato").value.trim();
  const enderecoAlvo = $("endereco").value.trim();
  if (!ethers.isAddress(enderecoContrato)) throw new Error(MENSAGENS.contratoInvalido);
  if (!ethers.isAddress(enderecoAlvo)) throw new Error(MENSAGENS.enderecoInvalido);

  if (!estado.provider || estado.modo !== $("modo").value) await conectar();
  const { provider } = estado;

  const codigo = await comTempoLimite(provider.getCode(enderecoContrato));
  if (codigo === "0x") throw new Error(mensagemSemContrato(enderecoContrato));

  const contrato = new ethers.Contract(enderecoContrato, ABI, provider);
  const [nome, simbolo, casas, total, saldo] = await comTempoLimite(
    Promise.all([
      contrato.name(),
      contrato.symbol(),
      contrato.decimals(),
      contrato.totalSupply(),
      contrato.balanceOf(enderecoAlvo),
    ]),
  );

  await pararDeOuvir();
  Object.assign(estado, {
    contrato,
    alvo: ethers.getAddress(enderecoAlvo),
    simbolo,
    casas,
    total,
  });
  mostrarToken(nome, ethers.getAddress(enderecoContrato));
  mostrarSaldo(saldo, "surge");
  await comecarAOuvir();
}

function mostrarSaldo(saldo, animacao) {
  estado.saldo = saldo;
  const { alvo, simbolo, casas, total, chainId, contrato } = estado;
  $("res-endereco").textContent = alvo;
  $("res-saldo").textContent = formatarQuantidade(saldo, casas);
  $("res-simbolo").textContent = simbolo;
  $("res-unidades").textContent = `Equivale a ${saldo} unidades mínimas (${casas} casas decimais).`;
  $("res-participacao").textContent = formatarParticipacao(saldo, total);

  const link = $("res-link");
  link.hidden = chainId !== 11155111;
  link.href = `https://sepolia.etherscan.io/token/${contrato.target}?a=${alvo}`;
  $("resultado").hidden = false;

  if (animacao) {
    const bloco = $("res-saldo-bloco");
    bloco.classList.remove("surge", "atualizou");
    void bloco.offsetWidth;
    bloco.classList.add(animacao);
  }
}

function mostrarToken(nome, enderecoContrato) {
  const { simbolo, casas, total, chainId, modo } = estado;
  $("tk-nome").textContent = nome;
  $("tk-simbolo").textContent = simbolo;
  $("tk-casas").textContent = casas.toString();
  $("tk-total").textContent = `${formatarQuantidade(total, casas)} ${simbolo}`;
  $("tk-rede").textContent = `${nomeDaRede(chainId)} (chain ID ${chainId})`;
  $("tk-contrato").textContent = enderecoContrato;
  const botao = $("botao-metamask");
  botao.textContent = `Adicionar ${simbolo} à MetaMask`;
  botao.hidden = modo !== "metamask";
  $("token").hidden = false;
}

async function comecarAOuvir() {
  if (estado.modo === "sepolia") return;
  const { contrato, alvo } = estado;

  const aoTransferir = async () => {
    try {
      const [saldo, total] = await Promise.all([contrato.balanceOf(alvo), contrato.totalSupply()]);
      if (estado.contrato !== contrato || estado.alvo !== alvo) return;
      if (saldo === estado.saldo && total === estado.total) return;
      estado.total = total;
      $("tk-total").textContent = `${formatarQuantidade(total, estado.casas)} ${estado.simbolo}`;
      mostrarSaldo(saldo, "atualizou");
    } catch (erro) {
      console.warn("Não foi possível atualizar o saldo:", erro);
    }
  };

  try {
    await contrato.on(contrato.filters.Transfer(alvo, null), aoTransferir);
    await contrato.on(contrato.filters.Transfer(null, alvo), aoTransferir);
    $("res-aovivo").hidden = false;
  } catch (erro) {
    console.warn("Não foi possível acompanhar o evento Transfer:", erro);
  }
}

async function pararDeOuvir() {
  $("res-aovivo").hidden = true;
  if (!estado.contrato) return;
  try {
    await estado.contrato.removeAllListeners();
  } catch {}
}

async function usarMinhaConta() {
  if (estado.modo !== "metamask" || !estado.conta) await conectar();
  $("endereco").value = estado.conta;
  $("endereco").focus();
}

async function adicionarNaMetaMask() {
  const adicionado = await window.ethereum.request({
    method: "wallet_watchAsset",
    params: {
      type: "ERC20",
      options: {
        address: estado.contrato.target,
        symbol: estado.simbolo,
        decimals: Number(estado.casas),
      },
    },
  });
  if (adicionado) $("botao-metamask").textContent = `${estado.simbolo} adicionado à MetaMask`;
}

function iniciar() {
  if (typeof window.ethers === "undefined") {
    mostrarErro(MENSAGENS.semEthers);
    definirOcupado(true);
    return;
  }

  const seletor = $("modo");
  const campoContrato = $("contrato");
  if (!window.ethereum) {
    seletor.value = "local";
    $("status").textContent = "MetaMask não detectada: a leitura pode ser feita pelo nó local ou pelo RPC público.";
  }
  $("botao-minha-conta").hidden = seletor.value !== "metamask";

  seletor.addEventListener("change", async () => {
    await pararDeOuvir();
    estado.provider?.destroy();
    Object.assign(estado, { provider: null, contrato: null, conta: null });
    $("botao-minha-conta").hidden = seletor.value !== "metamask";
    $("status").textContent = "Forma de leitura alterada. Clique em Conectar.";
  });
  campoContrato.addEventListener("input", () => {
    delete campoContrato.dataset.automatico;
    $("dica-contrato").textContent = "";
  });

  $("botao-conectar").addEventListener("click", acao(conectar));
  $("formulario").addEventListener("submit", acao(consultar));
  $("botao-minha-conta").addEventListener("click", acao(usarMinhaConta));
  $("botao-metamask").addEventListener("click", acao(adicionarNaMetaMask));

  window.ethereum?.on?.("chainChanged", () => {
    if (estado.modo === "metamask") acao(conectar)();
  });
  window.ethereum?.on?.("accountsChanged", (contas) => {
    if (estado.modo !== "metamask" || !estado.chainId) return;
    estado.conta = contas[0] ?? null;
    atualizarStatus();
  });
}

iniciar();
