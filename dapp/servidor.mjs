import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PASTA_DAPP = dirname(fileURLToPath(import.meta.url));
const PASTA_IMPLANTACOES = join(PASTA_DAPP, "..", "ignition", "deployments");
const PORTA_INICIAL = Number(process.env.PORTA ?? 5178);
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function resolverArquivo(caminho) {
  if (caminho === "/") return join(PASTA_DAPP, "index.html");
  const implantacao = caminho.match(/^\/implantacoes\/chain-(\d+)\.json$/);
  if (implantacao) {
    return join(PASTA_IMPLANTACOES, `chain-${implantacao[1]}`, "deployed_addresses.json");
  }
  if (/^\/[\w-]+\.(html|js|css|svg)$/.test(caminho)) return join(PASTA_DAPP, caminho.slice(1));
  return null;
}

const servidor = createServer(async (requisicao, resposta) => {
  try {
    const { pathname } = new URL(requisicao.url ?? "/", "http://localhost");
    const arquivo = resolverArquivo(decodeURIComponent(pathname));
    if (!arquivo) throw new Error("caminho não permitido");
    const conteudo = await readFile(arquivo);
    resposta.writeHead(200, {
      "Content-Type": TIPOS[extname(arquivo)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    resposta.end(conteudo);
  } catch {
    resposta.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    resposta.end("Arquivo não encontrado.");
  }
});

function iniciar(porta, tentativas = 10) {
  servidor.once("error", (erro) => {
    if (erro.code === "EADDRINUSE" && tentativas > 0) iniciar(porta + 1, tentativas - 1);
    else throw erro;
  });
  servidor.listen(porta, "127.0.0.1", () => {
    console.log(`\nPágina de consulta de saldo: http://localhost:${porta}`);
    console.log("Abra no navegador em que a MetaMask está instalada. Ctrl+C encerra.\n");
  });
}

iniciar(PORTA_INICIAL);
