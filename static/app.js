/* #####################################################################
   REVISÃO - correções aplicadas (procure por ">>> ALTERADO" com Ctrl+F)

   (1) Só salva no servidor quando o clique realmente muda dados
   (2) normalizarUsuario(): o login/cadastro também normaliza o usuário
   (3) Login, cadastro e perfil tratam erro de rede / resposta não-JSON
   (4) Logout e exclusão de conta limpam `dados` por completo
   (5) Login volta para a tela inicial e zera o filtro de gênero
   (6) Toast "Perfil atualizado" restaurado
   (7) Removidos "Trocar de conta", "Adicionar outra conta" e
       "Contas neste dispositivo" (a conta agora é do servidor)
   (8) Textos que diziam "neste navegador" atualizados
   (9) hashSenha() removida (o hash agora é feito no Flask)
   (10) fotoDeezer() renomeada para fotoDaBanda()
   ##################################################################### */

/* #####################################################################
   MAPA DOS FETCHS  (procure por ">>> FETCH" com Ctrl+F)

   Versão adaptada para usar as rotas Flask mantendo a lógica atual da interface.
   Pontos que exigem uma decisão de produto/backend estão marcados como TODO.

   BLOCO A - contas e dados do usuário (substitui o localStorage)
     FETCH 1   carregarDados()      GET    /api/me
     FETCH 2   salvarDados()        PUT    /api/dados
     FETCH 3   submit "af"          POST   /api/login  |  POST /api/register
     FETCH 4   submit "pf"          PUT    /api/perfil
     FETCH 5   case "logout"        POST   /api/logout
     FETCH 6   case "delyes"        DELETE /api/conta
     (opcional) rotas finas no lugar do salvarDados(): favoritos,
                playlists, histórico, gêneros, foto. Marcadas com
                ">>> FETCH (opcional)".

   BLOCO B - APIs externas passando pelo Flask
     FETCH 7   buscarItunes()       GET    /api/itunes?term=&limit=&attribute=
     FETCH 8   buscarIdsYouTube()   GET    /api/video?q=
     FETCH 9   buscarFoto()         GET    /api/banda/<nome>   (AudioDB)

   BLOCO C - APIs combinadas (AudioDB e Gemini)
     FETCH 10  carregarMusicasDaBanda() GET /api/banda/<nome>
     FETCH 11  NÃO IMPLEMENTADO: não existe ação/tela de recomendação no front.

   Lugares marcados com ">>> REMOVER" deixam de fazer sentido quando a
   conta passa a ser do servidor (várias contas no mesmo navegador).

   ATENÇÃO (async): carregarDados(), o login e várias ações viram async.
   Quem chama precisa de await, senão chega uma Promise em vez do dado.
   ##################################################################### */
/* =====================================================================
   MusicMatch - front-end (versão reescrita para leitura)

   Como o arquivo funciona, em uma frase:
   - os dados do usuário ficam no objeto `dados` em memória e são persistidos no Flask;
   - o estado da tela fica em variáveis soltas (telaAtual, modal, ...);
   - renderizar() redesenha a tela inteira dentro da <div id="app">;
   - todo clique passa por UM listener que olha o atributo data-a.

   Fluxo geral: clique -> altera `dados` ou o estado -> salvarDados()
   -> renderizar().

   Ordem do arquivo:
     1. Configuração e catálogo de bandas
     2. Funções utilitárias
     3. Dados e persistência (Flask)
     4. Estado da tela
     5. APIs externas via Flask (iTunes, AudioDB, YouTube)
     6. Player de música
     7. Fotos dos artistas e busca
     8. Telas (HTML gerado em JS)
     9. Eventos (click, submit, change, input, teclado)
   ===================================================================== */


/* =====================================================================
   1. CONFIGURAÇÃO E CATÁLOGO
   ===================================================================== */

// As chaves das APIs externas ficam exclusivamente no .env do Flask.

// Caminho do logo (o Flask serve arquivos da pasta static em /static/).
const LOGO = "/static/logo.webp";

// Catálogo fixo. Cada banda é uma lista:
// [nome, país, ano de fundação, ouvintes (em milhões, valor de exemplo),
//  "música 1|música 2"]
const CATALOGO_POR_GENERO = {
  "Rock": [
    ["Queen", "Reino Unido", 1970, 52, "Bohemian Rhapsody|Don't Stop Me Now"],
    ["Foo Fighters", "Estados Unidos", 1994, 20, "Everlong|The Pretender"],
    ["Nirvana", "Estados Unidos", 1987, 28, "Smells Like Teen Spirit|Come as You Are"],
    ["Arctic Monkeys", "Reino Unido", 2002, 30, "Do I Wanna Know?|R U Mine?"],
    ["The Beatles", "Reino Unido", 1960, 35, "Hey Jude|Let It Be"],
    ["Led Zeppelin", "Reino Unido", 1968, 32, "Stairway to Heaven|Whole Lotta Love"],
    ["The Rolling Stones", "Reino Unido", 1962, 22, "Paint It Black|(I Can't Get No) Satisfaction"],
  ],
  "Pop": [
    ["ABBA", "Suécia", 1972, 38, "Dancing Queen|Mamma Mia"],
    ["Coldplay", "Reino Unido", 1996, 70, "Yellow|Fix You"],
    ["Imagine Dragons", "Estados Unidos", 2008, 55, "Believer|Radioactive"],
    ["Maroon 5", "Estados Unidos", 1994, 45, "Sugar|Moves Like Jagger"],
    ["Backstreet Boys", "Estados Unidos", 1993, 14, "I Want It That Way|Everybody (Backstreet's Back)"],
    ["Fleetwood Mac", "Reino Unido", 1967, 22, "Dreams|Go Your Own Way"],
    ["Spice Girls", "Reino Unido", 1994, 6, "Wannabe|Spice Up Your Life"],
  ],
  "Jazz": [
    ["Weather Report", "Estados Unidos", 1970, 1, "Birdland|Teen Town"],
    ["Dave Brubeck Quartet", "Estados Unidos", 1951, 3, "Take Five|Blue Rondo à la Turk"],
    ["Snarky Puppy", "Estados Unidos", 2004, 1, "Lingus|Shofukan"],
    ["Return to Forever", "Estados Unidos", 1971, 1, "Spain|No Mystery"],
    ["Pat Metheny Group", "Estados Unidos", 1977, 1, "Last Train Home|Phase Dance"],
  ],
  "Eletrônica": [
    ["Daft Punk", "França", 1993, 27, "Around the World|One More Time"],
    ["Kraftwerk", "Alemanha", 1970, 5, "Autobahn|The Model"],
    ["The Chemical Brothers", "Reino Unido", 1989, 6, "Block Rockin' Beats|Galvanize"],
    ["Justice", "França", 2003, 5, "D.A.N.C.E.|Genesis"],
    ["Depeche Mode", "Reino Unido", 1980, 18, "Enjoy the Silence|Personal Jesus"],
    ["Massive Attack", "Reino Unido", 1988, 7, "Teardrop|Unfinished Sympathy"],
    ["Underworld", "Reino Unido", 1980, 2, "Born Slippy|Two Months Off"],
  ],
  "Hip hop": [
    ["Run-D.M.C.", "Estados Unidos", 1981, 3, "It's Tricky|Walk This Way"],
    ["Public Enemy", "Estados Unidos", 1985, 4, "Fight the Power|Bring the Noise"],
    ["A Tribe Called Quest", "Estados Unidos", 1985, 6, "Can I Kick It?|Scenario"],
    ["Racionais MC's", "Brasil", 1988, 4, "Diário de um Detento|Capítulo 4, Versículo 3"],
    ["N.W.A", "Estados Unidos", 1986, 8, "Straight Outta Compton|Express Yourself"],
    ["Wu-Tang Clan", "Estados Unidos", 1992, 9, "C.R.E.A.M.|Triumph"],
    ["De La Soul", "Estados Unidos", 1988, 3, "Me Myself and I|Eye Know"],
  ],
  "Metal": [
    ["Metallica", "Estados Unidos", 1981, 31, "Enter Sandman|One"],
    ["Iron Maiden", "Reino Unido", 1975, 14, "The Trooper|Run to the Hills"],
    ["Black Sabbath", "Reino Unido", 1968, 20, "Paranoid|Iron Man"],
    ["Sepultura", "Brasil", 1984, 6, "Roots Bloody Roots|Refuse/Resist"],
    ["Slayer", "Estados Unidos", 1981, 7, "Raining Blood|Angel of Death"],
    ["Megadeth", "Estados Unidos", 1983, 12, "Symphony of Destruction|Hangar 18"],
    ["Pantera", "Estados Unidos", 1981, 9, "Walk|Cowboys from Hell"],
  ],
  "Rock brasileiro": [
    ["Legião Urbana", "Brasil", 1982, 5, "Tempo Perdido|Pais e Filhos"],
    ["Titãs", "Brasil", 1982, 3, "Epitáfio|Comida"],
    ["Os Mutantes", "Brasil", 1966, 1, "A Minha Menina|Panis et Circenses"],
    ["Nação Zumbi", "Brasil", 1991, 1, "Maracatu Atômico|A Praieira"],
    ["Os Paralamas do Sucesso", "Brasil", 1977, 4, "Alagados|Meu Erro"],
    ["Barão Vermelho", "Brasil", 1981, 2, "Pro Dia Nascer Feliz|Bete Balanço"],
    ["Charlie Brown Jr.", "Brasil", 1992, 6, "Só os Loucos Sabem|Zóio de Lula"],
  ],
  "Reggae": [
    ["Bob Marley & The Wailers", "Jamaica", 1963, 25, "No Woman, No Cry|Is This Love"],
    ["Steel Pulse", "Reino Unido", 1975, 0.3, "Ku Klux Klan|Your House"],
    ["Toots and the Maytals", "Jamaica", 1962, 1, "Pressure Drop|54-46 Was My Number"],
    ["UB40", "Reino Unido", 1978, 3, "Red Red Wine|Can't Help Falling in Love"],
    ["Burning Spear", "Jamaica", 1969, 1, "Marcus Garvey|Slavery Days"],
    ["Third World", "Jamaica", 1973, 1, "Now That We Found Love|1865 (96° in the Shade)"],
    ["Black Uhuru", "Jamaica", 1972, 1, "Sinsemilla|Shine Eye Gal"],
  ],
};

// Lista única de bandas, montada a partir do catálogo por gênero.
// Cada banda vira um objeto:
//   nome, pais, ano, ouvintes, genero, musicas (lista de títulos)
const BANDAS = [];
for (const genero in CATALOGO_POR_GENERO) {
  CATALOGO_POR_GENERO[genero].forEach(([nome, pais, ano, ouvintes, musicas]) => {
    BANDAS.push({ nome, pais, ano, ouvintes, genero, musicas: musicas.split("|") });
  });
}

// Procura uma banda pelo nome exato (devolve undefined se não achar).
const acharBanda = (nome) => BANDAS.find((b) => b.nome === nome);


/* =====================================================================
   2. FUNÇÕES UTILITÁRIAS
   ===================================================================== */

// Atalho para document.querySelector.
const qs = (seletor) => document.querySelector(seletor);

// Atalho para document.getElementById.
const porId = (id) => document.getElementById(id);

// A <div id="app"> onde todas as telas são desenhadas.
const raiz = qs("#app");

// Escapa caracteres especiais de HTML. Usado em todo texto que vem do
// usuário ou de APIs antes de entrar em innerHTML (evita injetar código).
const escapar = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

// Formata o número de ouvintes (em milhões): 52 -> "52 mi", 0.3 -> "300 mil".
function formatarOuvintes(n) {
  if (n < 1) return Math.round(n * 1000) + " mil";
  const texto = n % 1 ? n.toFixed(1) : n.toFixed(0);
  return texto.replace(".", ",") + " mi";
}

// Gera um número de matiz (180 a 279) a partir do nome. Serve para dar
// uma cor diferente a cada card de banda enquanto a foto não carrega.
const matizPorNome = (nome) =>
  180 + ([...nome].reduce((soma, c) => soma + c.charCodeAt(0), 0) % 100);

// Liga/desliga um item numa lista: se existe, remove; se não existe, adiciona.
// Usado para favoritar e salvar.
function alternarItem(lista, item) {
  const i = lista.indexOf(item);
  if (i < 0) lista.push(item);
  else lista.splice(i, 1);
}
// >>> ALTERADO (9): hashSenha() removida. O hash da senha agora é feito no
// Flask (werkzeug/bcrypt); o navegador só envia a senha digitada por HTTPS.

// Converte segundos em "m:ss" (ex.: 75 -> "1:15").
function formatarTempo(segundos) {
  if (!isFinite(segundos)) return "0:00";
  const min = Math.floor(segundos / 60);
  const seg = String(Math.floor(segundos % 60)).padStart(2, "0");
  return min + ":" + seg;
}

// Mostra uma mensagem rápida (toast) na tela por 2,2 segundos.
function mostrarAviso(texto) {
  const d = document.createElement("div");
  d.className = "toast";
  d.textContent = texto;
  d.setAttribute("role", "status");
  document.body.append(d);
  setTimeout(() => d.remove(), 2200);
}

// Registra uma visualização de faixa no servidor (fire-and-forget).
// Aceita um objeto faixa com { t, a, c, u } ou strings soltas.
function registrarVisualizacao(faixa) {
  if (!faixa || !faixa.t || !faixa.a) return;
  fetch("/api/visualizacao", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ t: faixa.t, a: faixa.a, c: faixa.c || "", u: faixa.u || "" }),
  }).catch(() => {}); // falha silenciosa — contagem não é crítica
}


/* =====================================================================
   3. DADOS E PERSISTÊNCIA
   ---------------------------------------------------------------------
   `dados` tem a forma:
     { u: [usuários], a: id do usuário logado (ou null) }

   Cada usuário:
     { id, nome, email, pw (hash), foto, bio,
       gen: [gêneros escolhidos],
       fav: [nomes de bandas favoritas],
       sav: [nomes de bandas salvas],
       pl:  [{ id, nome, t: [músicas] }]  (playlists),
       hist:[{ n: nome da banda, t: timestamp }] }

   Os dados são carregados e persistidos pelo Flask por carregarDados() e salvarDados().
   ===================================================================== */

// >>> ALTERADO (2): função nova. Garante que o usuário tenha sempre as listas
// que o front espera (gen, fav, sav, pl, hist) e foto/bio como texto.
// Antes essa normalização existia só dentro de carregarDados(); agora o login
// e o cadastro usam a mesma função, para não quebrar com `gen: null` etc.
function normalizarUsuario(usuario) {
  usuario.gen = Array.isArray(usuario.gen) ? usuario.gen : [];
  usuario.fav = Array.isArray(usuario.fav) ? usuario.fav : [];
  usuario.sav = Array.isArray(usuario.sav) ? usuario.sav : [];
  usuario.pl = Array.isArray(usuario.pl) ? usuario.pl : [];
  usuario.hist = Array.isArray(usuario.hist) ? usuario.hist : [];
  usuario.foto = usuario.foto || "";
  usuario.bio = usuario.bio || "";
  return usuario;
}

// >>> FETCH 1  (GET /api/me)
// Hoje: lê do localStorage, de forma SÍNCRONA, na linha `let dados = carregarDados()`.
// Com o Flask: vira async. Ao abrir a página, pergunte ao servidor quem está logado.
//
async function carregarDados() {
  try {
    const r = await fetch("/api/me", { credentials: "same-origin" });
    if (r.status === 401) return { u: [], a: null };
    if (!r.ok) throw new Error("Falha ao carregar sessão: HTTP " + r.status);
    const usuario = await r.json();
    if (!usuario || usuario.id == null) return { u: [], a: null };

    // >>> ALTERADO (2): a normalização saiu daqui e foi para normalizarUsuario().
    normalizarUsuario(usuario);
    return { u: [usuario], a: usuario.id };
  } catch (erro) {
    console.error("Erro ao carregar dados do usuário:", erro);
    mostrarAviso("Não foi possível carregar sua sessão.");
    return { u: [], a: null };
  }
}

// Mantém a ordem das gravações para que respostas lentas não sobrescrevam
// alterações mais recentes. O front continua alterando o objeto `dados` como antes.
let filaSalvamento = Promise.resolve();
function salvarDados() {
  const u = usuarioAtual();
  if (!u) return;

  const copia = {
    gen: u.gen, fav: u.fav, sav: u.sav, pl: u.pl, hist: u.hist, foto: u.foto,
  };
  filaSalvamento = filaSalvamento
    .catch(() => {})
    .then(async () => {
      const r = await fetch("/api/dados", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(copia),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
    })
    .catch((erro) => {
      console.error("Erro ao salvar dados:", erro);
      mostrarAviso("Não foi possível salvar no servidor.");
    });
}

// ---------------------------------------------------------------------
// 4. ESTADO DA TELA (não é salvo; some ao recarregar a página)
// ---------------------------------------------------------------------
let textoBusca = "";              // o que está digitado na busca
let dados = { u: [], a: null };      // banco de dados local
let telaAtual = "home";           // home | lib | pl | hist | prof | gen
let filtroGenero = "Todos";       // filtro de gênero na home
let abaBiblioteca = "fav";        // aba da biblioteca: fav ou sav
let abaAuth = "login";            // tela de autenticação: login ou reg
let adicionandoConta = false;     // true quando clicou em "Adicionar outra conta"
let menuAberto = false;           // menu do avatar no cabeçalho
let modal = null;                 // modal aberto (ou null). Ver mdHtml()
let playlistAberta = null;        // id da playlist que está sendo vista
let generosSelecionados = new Set(); // seleção na tela de escolher gêneros

// Devolve o usuário logado (ou undefined).
const usuarioAtual = () => dados.u.find((u) => u.id === dados.a);


/* =====================================================================
   5. APIs EXTERNAS
   ===================================================================== */

// Resultados da busca no iTunes (lista de faixas) e mensagem de status.
let resultadosBusca = [];
let statusBusca = "";
let timerBusca = null;

// Mais Escutadas: lista carregada do servidor e flag de carregamento.
let maisEscutadas = [];
let maisEscutadasCarregadas = false;

// Busca o top de músicas mais visualizadas do servidor (chamada uma vez no boot).
async function carregarMaisEscutadas() {
  try {
    const r = await fetch("/api/mais-escutadas?limit=10", { credentials: "same-origin" });
    if (!r.ok) return;
    maisEscutadas = await r.json();
    maisEscutadasCarregadas = true;
  } catch {
    // falha silenciosa
  }
}

// Todas as faixas que já apareceram na tela ficam registradas aqui.
// Os botões guardam só o índice (data-k) e o código busca a faixa neste vetor.
const FAIXAS = [];

// Registra uma faixa em FAIXAS e devolve o índice. Se a mesma faixa
// (mesmo título e artista) já existe, reaproveita o índice.
function registrarFaixa(faixa) {
  let i = FAIXAS.findIndex((x) => x.t === faixa.t && x.a === faixa.a);
  if (i < 0) i = FAIXAS.push(faixa) - 1;
  return i;
}

// Playlists antigas guardavam a música como {n: banda, i: posição}.
// Esta função converte esse formato antigo para o novo
// ({t: título, a: artista, u: prévia, c: capa}). Se já está no novo
// formato, devolve como está.
function resolverFaixa(item) {
  if (!item.n) return item;
  const banda = acharBanda(item.n) || { musicas: [] };
  return { t: banda.musicas[item.i] || "", a: item.n, u: "", c: "" };
}

// >>> FETCH 7  (GET /api/itunes)
// Troque APENAS a URL e o tratamento da resposta; o resto do front continua igual,
// porque a função devolve o mesmo formato { t, a, al, c, u, v }.
// Uma única mudança aqui cobre: busca digitada, músicas da banda, prévia de 30 s
// e a foto de reserva.
//
//   const url = "/api/itunes?term=" + encodeURIComponent(termo) +
//               "&limit=" + limite + (atributo ? "&attribute=" + atributo : "");
//   const resposta = await fetch(url);
//   if (!resposta.ok) throw new Error("Falha ao consultar o servidor");
//   return await resposta.json();      // o Flask já devolve a lista pronta, nesse formato
//
// No Flask: use requests.get("https://itunes.apple.com/search", params=...), filtre
// os itens com previewUrl e monte a lista {t, a, al, c, u, v} (c = artworkUrl100 com
// "100x100" trocado por "200x200").
// Busca músicas no iTunes. Devolve uma lista de faixas no formato:
//   t = título, a = artista, al = álbum, c = capa,
//   u = URL da prévia de 30 s, v = link da faixa
// Só ficam faixas que têm prévia de áudio.
async function buscarItunes(termo, limite, atributo) {
  const params = new URLSearchParams({ term: termo, limit: String(limite || 10) });
  if (atributo) params.set("attribute", atributo);
  const resposta = await fetch("/api/itunes?" + params.toString(), {
    credentials: "same-origin",
  });
  if (!resposta.ok) throw new Error("Falha ao consultar o iTunes pelo servidor (HTTP " + resposta.status + ")");
  const lista = await resposta.json();
  if (!Array.isArray(lista)) throw new Error("Resposta inválida da rota /api/itunes");
  return lista;
}

// >>> FETCH 8  (GET /api/video)
// Troque o corpo INTEIRO da função (e apague listarServidoresInvidious, buscarJsonComTimeout
// e SERVIDORES_PIPED) por uma chamada só. A chave do YouTube fica no .env do Flask.
//
async function buscarIdsYouTube(consulta) {
  try {
    const r = await fetch("/api/video?q=" + encodeURIComponent(consulta), {
      credentials: "same-origin",
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const ids = await r.json();
    if (!Array.isArray(ids)) throw new Error("Resposta inválida da rota /api/video");
    return [...new Set(ids.filter((id) => typeof id === "string" && /^[\w-]{11}$/.test(id)))].slice(0, 3);
  } catch (erro) {
    console.error("Erro ao buscar vídeo:", erro);
    return [];
  }
}


/* =====================================================================
   6. PLAYER DE MÚSICA
   ---------------------------------------------------------------------
   Dois modos de reprodução:
     "30"   -> prévia de 30 s do iTunes, tocada com o objeto Audio
     "full" -> vídeo completo do YouTube, tocado no player do YouTube
   ===================================================================== */

// Estado do player.
const player = {
  fila: [],          // lista de faixas a tocar
  indice: -1,        // posição da faixa atual na fila (-1 = nada)
  modo: "30",        // "30" ou "full"
  tocando: false,    // está tocando agora?
  expandido: false,  // painel grande (fila + capa) aberto?
  minimizado: false, // vídeo escondido (o som continua)
  pedindoLink: false,// mostrando o campo para colar link do YouTube?
  falhou: false,     // o vídeo falhou e não dá para tocar?
  idsVideo: [],      // IDs de vídeo candidatos para a faixa atual
  indiceVideo: 0,    // qual candidato está em uso
  token: 0,          // número da "tentativa" atual (ver tocarFaixa)
};

const audio = new Audio();     // toca as prévias de 30 s
audio.preload = "none";

let ytPlayer = null;           // objeto do player do YouTube (depois de carregado)
let ytPromessa = null;         // promessa do carregamento, para não carregar duas vezes
let arrastandoBarra = false;   // usuário está arrastando a barra de progresso?

// Cria o HTML do player e coloca no final do <body>.
const elPlayer = document.createElement("div");
elPlayer.id = "pl";
elPlayer.className = "glass";
elPlayer.hidden = true;
elPlayer.setAttribute("role", "region");
elPlayer.setAttribute("aria-label", "Player");
elPlayer.innerHTML = `
<div class="pl-exp">
  <div class="pl-media" id="pl-media">
    <img id="pl-cv" alt="">
    <div id="pl-vid"><div id="ytp"></div></div>
  </div>
  <div class="pl-q"><h3>Fila de reprodução</h3><div id="pl-ql"></div></div>
</div>
<div class="pl-bar">
  <div class="pl-info">
    <img id="pl-th" alt="">
    <div style="min-width:0">
      <b id="pl-t"></b><span id="pl-a"></span><span id="pl-st" aria-live="polite"></span>
    </div>
  </div>
  <div class="pl-ctl">
    <button class="ib" id="pl-pv" aria-label="Anterior">⏮</button>
    <button id="pl-pp" aria-label="Tocar ou pausar">▶</button>
    <button class="ib" id="pl-nx" aria-label="Próxima">⏭</button>
  </div>
  <div class="pl-seek">
    <span id="pl-cu">0:00</span>
    <input type="range" id="pl-sk" min="0" max="30" step="0.1" value="0" aria-label="Progresso">
    <span id="pl-du">0:30</span>
  </div>
  <div class="pl-right">
    <div class="seg" role="group" aria-label="Modo de reprodução">
      <button id="pl-m30" aria-pressed="true">30 s</button>
      <button id="pl-mf" aria-pressed="false">Vídeo completo</button>
    </div>
    <input type="range" id="pl-vo" min="0" max="100" value="80" aria-label="Volume">
    <button class="ib" id="pl-ln" aria-label="Colar link do YouTube" title="Escolher outro vídeo (colar link)">🔗</button>
    <button class="ib" id="pl-mn" aria-label="Minimizar vídeo" aria-pressed="false" title="Minimizar vídeo (o som continua)">▭</button>
    <button class="ib" id="pl-fs" aria-label="Tela cheia" title="Tela cheia">⛶</button>
    <button class="ib" id="pl-ex" aria-label="Expandir" aria-expanded="false" title="Expandir">⌃</button>
    <button class="ib" id="pl-x" aria-label="Fechar player">✕</button>
  </div>
  <div id="pl-man" hidden>
    <input id="pl-url" placeholder="Cole aqui o link do vídeo do YouTube" aria-label="Link do vídeo do YouTube">
    <button class="btn" id="pl-ok">Usar este vídeo</button>
  </div>
</div>`;
document.body.append(elPlayer);

// Guarda a altura do player na variável CSS --plh, para a página
// reservar espaço embaixo e o player não cobrir o conteúdo.
if (window.ResizeObserver) {
  new ResizeObserver(() => {
    document.documentElement.style.setProperty("--plh", elPlayer.offsetHeight + "px");
  }).observe(elPlayer);
}

// Volume atual (0 a 100) lido do controle deslizante.
const volumeAtual = () => +porId("pl-vo").value;

// Marca se está tocando e troca o ícone do botão (▶ / ⏸).
function definirTocando(tocando) {
  player.tocando = tocando;
  porId("pl-pp").textContent = tocando ? "⏸" : "▶";
}

// Mostra uma mensagem de status no player. Se `comLinks` for true,
// acrescenta links para procurar a música no Spotify e no YouTube.
function mostrarStatus(texto, comLinks) {
  const faixa = player.fila[player.indice];
  const busca = faixa ? encodeURIComponent(faixa.a + " " + faixa.t) : "";
  porId("pl-st").innerHTML =
    escapar(texto || "") +
    (comLinks && faixa
      ? ` <a href="https://open.spotify.com/search/${busca}" target="_blank" rel="noopener">Spotify</a>` +
        ` · <a href="https://www.youtube.com/results?search_query=${busca}" target="_blank" rel="noopener">YouTube</a>`
      : "");
}

// Atualiza a aparência do player (título, capa, botões, fila) de acordo
// com o estado atual. Não toca nada, só desenha.
function atualizarPlayer() {
  const faixa = player.fila[player.indice];
  if (!faixa) return;

  elPlayer.hidden = false;
  document.body.classList.add("hasp");

  // Há vídeo visível só no modo completo e se não falhou.
  const comVideo = player.modo === "full" && !player.falhou;
  elPlayer.classList.toggle("vid", comVideo);
  elPlayer.classList.toggle("mini", comVideo && player.minimizado);
  elPlayer.classList.toggle("ex", player.expandido);
  porId("pl-man").hidden = !(player.modo === "full" && player.pedindoLink);
  porId("pl-mn").setAttribute("aria-pressed", String(player.minimizado));

  porId("pl-t").textContent = faixa.t;
  porId("pl-a").textContent = faixa.a;

  // Capa: a da faixa, ou a foto do artista, ou nenhuma.
  const imagem = faixa.c || FOTOS[faixa.a] || "";
  ["pl-th", "pl-cv"].forEach((id) => {
    if (imagem) porId(id).src = imagem;
    else porId(id).removeAttribute("src");
  });

  porId("pl-m30").setAttribute("aria-pressed", String(player.modo === "30"));
  porId("pl-mf").setAttribute("aria-pressed", String(player.modo === "full"));
  porId("pl-ex").setAttribute("aria-expanded", String(player.expandido));
  porId("pl-ex").textContent = player.expandido ? "⌄" : "⌃";

  // Lista da fila, com a faixa atual marcada em aria-current.
  porId("pl-ql").innerHTML = player.fila
    .map(
      (x, n) =>
        `<button class="pl-qi" data-n="${n}" aria-current="${n === player.indice}">` +
        `<span>${n + 1}.</span>` +
        `<span>${escapar(x.t)} <small class="m">${escapar(x.a)}</small></span></button>`
    )
    .join("");

  // Informações para os controles de mídia do sistema (tela de bloqueio etc.).
  if ("mediaSession" in navigator && window.MediaMetadata) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: faixa.t,
      artist: faixa.a,
      album: faixa.al || "",
      artwork: imagem ? [{ src: imagem, sizes: "200x200" }] : [],
    });
  }
}

// Atualiza a barra de progresso e os tempos (atual / total).
function atualizarProgresso(atual, total) {
  total = total || 30;
  if (!arrastandoBarra) {
    porId("pl-sk").max = total;
    porId("pl-sk").value = atual;
  }
  porId("pl-cu").textContent = formatarTempo(atual);
  porId("pl-du").textContent = formatarTempo(total);
}

// Posição atual da reprodução, em segundos.
function posicaoAtual() {
  if (player.modo === "full") {
    try {
      return ytPlayer && ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
    } catch {
      return 0;
    }
  }
  return audio.currentTime;
}

// A cada 0,4 s, lê a posição do áudio/vídeo e atualiza a barra.
setInterval(() => {
  if (player.indice < 0) return;
  let atual = 0;
  let total = 0;
  if (player.modo === "full") {
    try {
      if (ytPlayer && ytPlayer.getCurrentTime) {
        atual = ytPlayer.getCurrentTime();
        total = ytPlayer.getDuration();
      }
    } catch {
      // player ainda não está pronto
    }
  } else {
    atual = audio.currentTime;
    total = audio.duration || 30;
  }
  atualizarProgresso(atual, total);
}, 400);

// Carrega a API de iframe do YouTube (uma única vez) e cria o player.
// Devolve uma promessa que resolve com o player, ou null se falhar.
function carregarPlayerYouTube() {
  if (ytPromessa) return ytPromessa;

  ytPromessa = new Promise((resolver) => {
    // Cria o player dentro da div #ytp quando a API estiver pronta.
    const criarPlayer = () => {
      try {
        ytPlayer = new YT.Player("ytp", {
          width: "100%",
          height: "100%",
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            controls: 0,        // os controles são os do site
            disablekb: 1,
            iv_load_policy: 3,
          },
          events: {
            onReady: () => resolver(ytPlayer),
            onStateChange: (e) => {
              if (player.modo !== "full") return;
              if (e.data === 0) proxima();              // terminou
              else if (e.data === 1) definirTocando(true);  // tocando
              else if (e.data === 2) definirTocando(false); // pausado
            },
            onError: () => tentarProximoVideo(), // vídeo bloqueado/removido
          },
        });
      } catch {
        resolver(null);
      }
    };

    // Se a API já está carregada, cria direto.
    if (window.YT && YT.Player) return criarPlayer();

    // Senão, baixa o script da API; ela chama esta função global ao ficar pronta.
    window.onYouTubeIframeAPIReady = criarPlayer;
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => resolver(null);
    document.head.append(script);

    // Desiste de esperar após 10 s.
    setTimeout(() => resolver(ytPlayer), 10000);
  });

  return ytPromessa;
}

// Cache dos vídeos já encontrados: { "artista|título": [ids] }.
// Fica no localStorage para não buscar de novo.
let cacheVideos = {};
try {
  cacheVideos = JSON.parse(localStorage.getItem("mmv")) || {};
} catch {
  cacheVideos = {};
}
const chaveVideo = (faixa) => (faixa.a + "|" + faixa.t).toLowerCase();
function salvarCacheVideos() {
  try {
    localStorage.setItem("mmv", JSON.stringify(cacheVideos));
  } catch {
    // ignora
  }
}

// Usuário colou um link do YouTube: extrai o ID de 11 caracteres,
// guarda no cache para essa faixa e toca em modo completo.
function usarLinkManual() {
  const texto = porId("pl-url").value.trim();
  const achou =
    texto.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/) ||
    texto.match(/^([\w-]{11})$/);
  const faixa = player.fila[player.indice];
  if (!faixa) return;
  if (!achou) {
    mostrarStatus("Esse link não parece ser do YouTube. Copie o endereço do vídeo.", true);
    return;
  }
  cacheVideos[chaveVideo(faixa)] = [achou[1]];
  salvarCacheVideos();
  faixa.ids = [achou[1]];
  porId("pl-url").value = "";
  tocarFaixa(player.indice, "full");
}
porId("pl-url").addEventListener("keydown", (e) => {
  if (e.key === "Enter") usarLinkManual();
});

// O vídeo atual deu erro: tenta o próximo ID candidato. Se acabaram
// os candidatos, pede para o usuário colar um link.
function tentarProximoVideo() {
  if (player.modo !== "full") return;
  if (player.idsVideo[player.indiceVideo + 1]) {
    player.indiceVideo++;
    ytPlayer.loadVideoById(player.idsVideo[player.indiceVideo]);
    return;
  }
  definirTocando(false);
  player.falhou = true;
  player.pedindoLink = true;
  atualizarPlayer();
  mostrarStatus("Esse vídeo não pode ser tocado aqui. Cole o link de outro vídeo:", true);
}

// Toca a faixa de posição `i` da fila, no modo "30" ou "full".
// É a função central do player.
//
// `token`: cada chamada recebe um número novo. Como as buscas são
// assíncronas, se o usuário clicar em outra faixa enquanto uma busca
// ainda está rodando, o token muda e a busca antiga é descartada
// (os `if (id !== player.token) return`).
async function tocarFaixa(i, modo) {
  const faixa = player.fila[i];
  if (!faixa) return;

  const id = ++player.token;
  player.indice = i;
  player.modo = modo === "full" ? "full" : "30";
  player.falhou = false;
  player.pedindoLink = false;
  definirTocando(false);

  // Para qualquer coisa que estivesse tocando.
  audio.pause();
  try {
    ytPlayer && ytPlayer.pauseVideo && ytPlayer.pauseVideo();
  } catch {
    // ignora
  }
  atualizarProgresso(0, 30);
  atualizarPlayer();

  // ---------- Modo vídeo completo (YouTube) ----------
  if (player.modo === "full") {
    mostrarStatus("Procurando o vídeo...");

    // Usa o cache ou os IDs já guardados na faixa; senão busca.
    let ids = cacheVideos[chaveVideo(faixa)] || faixa.ids;
    if (!ids || !ids.length) {
      ids = await buscarIdsYouTube(faixa.a + " " + faixa.t);
      if (id !== player.token) return; // o usuário mudou de faixa
      if (ids.length) {
        faixa.ids = ids;
        cacheVideos[chaveVideo(faixa)] = ids;
        salvarCacheVideos();
      }
    }

    if (!ids.length) {
      player.falhou = true;
      player.pedindoLink = true;
      atualizarPlayer();
      mostrarStatus("Não achei o vídeo sozinho. Abra a busca, copie o link do vídeo certo e cole aqui:", true);
      return;
    }

    const yt = await carregarPlayerYouTube();
    if (id !== player.token) return;
    if (!yt || !yt.loadVideoById) {
      ytPromessa = null; // permite tentar carregar de novo depois
      mostrarStatus("Não foi possível carregar o player do YouTube. Ouça pelos links:", true);
      return;
    }

    player.idsVideo = ids;
    player.indiceVideo = 0;
    mostrarStatus("");
    yt.setVolume(volumeAtual());
    yt.loadVideoById(ids[0]);
    return;
  }

  // ---------- Modo prévia de 30 s (iTunes) ----------
  // Se a faixa ainda não tem URL de prévia, busca no iTunes.
  if (!faixa.u) {
    mostrarStatus("Buscando prévia...");
    try {
      const resultados = await buscarItunes(faixa.a + " " + faixa.t, 5);
      if (id !== player.token) return;
      // Prefere o resultado cujo artista contém a primeira palavra do nome.
      const primeiraPalavra = faixa.a.toLowerCase().split(" ")[0];
      const melhor =
        resultados.find((r) => r.a.toLowerCase().includes(primeiraPalavra)) ||
        resultados[0];
      if (melhor) {
        faixa.u = melhor.u;
        faixa.c = faixa.c || melhor.c;
        faixa.v = faixa.v || melhor.v;
      }
    } catch {
      if (id !== player.token) return;
      mostrarStatus("Não foi possível consultar o iTunes.", true);
      return;
    }
    atualizarPlayer();
  }

  if (!faixa.u) {
    mostrarStatus("Prévia não encontrada. Tente o vídeo completo.");
    return;
  }

  audio.src = faixa.u;
  audio.volume = volumeAtual() / 100;
  mostrarStatus("");
  try {
    await audio.play();
  } catch {
    // O navegador pode bloquear o play automático.
    if (id === player.token) mostrarStatus("Clique em ▶ para tocar.");
  }
}

// Começa a tocar uma fila a partir da posição `i`.
function iniciarFila(fila, i, modo) {
  player.fila = fila;
  tocarFaixa(i, modo);
}

// Vai para a próxima faixa; se era a última, só para.
function proxima() {
  if (player.indice + 1 < player.fila.length) tocarFaixa(player.indice + 1, player.modo);
  else definirTocando(false);
}

// Pula para `segundos` dentro da faixa atual.
function irPara(segundos) {
  segundos = Math.max(0, segundos);
  if (player.modo === "full") {
    try {
      ytPlayer && ytPlayer.seekTo && ytPlayer.seekTo(segundos, true);
    } catch {
      // ignora
    }
  } else {
    audio.currentTime = segundos;
  }
}

// Botão "anterior": se já passou de 3 s (ou é a primeira), volta ao início
// da faixa; senão vai para a faixa anterior.
function anterior() {
  if (posicaoAtual() > 3 || player.indice <= 0) irPara(0);
  else tocarFaixa(player.indice - 1, player.modo);
}

// Play/pause.
function tocarOuPausar() {
  if (player.indice < 0) return;
  if (player.modo === "full") {
    if (!ytPlayer || !ytPlayer.playVideo) return;
    if (player.tocando) ytPlayer.pauseVideo();
    else ytPlayer.playVideo();
  } else if (audio.paused) {
    audio.play().catch(() => {});
  } else {
    audio.pause();
  }
}

// Fecha o player e limpa a fila.
function pararPlayer() {
  player.token++; // cancela buscas pendentes
  audio.pause();
  try {
    ytPlayer && ytPlayer.stopVideo && ytPlayer.stopVideo();
  } catch {
    // ignora
  }
  player.fila = [];
  player.indice = -1;
  player.tocando = false;
  elPlayer.hidden = true;
  document.body.classList.remove("hasp");
}

// Eventos do objeto Audio (só valem no modo de 30 s).
audio.onplay = () => { if (player.modo === "30") definirTocando(true); };
audio.onpause = () => { if (player.modo === "30") definirTocando(false); };
audio.onended = () => { if (player.modo === "30") proxima(); };

// Cliques nos botões do player (um único listener, olha o id do botão).
elPlayer.addEventListener("click", (e) => {
  const botao = e.target.closest("button");
  if (!botao) return;
  const id = botao.id;

  if (id === "pl-pp") tocarOuPausar();
  else if (id === "pl-nx") proxima();
  else if (id === "pl-pv") anterior();
  else if (id === "pl-m30" && player.indice >= 0) tocarFaixa(player.indice, "30");
  else if (id === "pl-mf" && player.indice >= 0) tocarFaixa(player.indice, "full");
  else if (id === "pl-ex") {
    player.expandido = !player.expandido;
    if (player.expandido) player.minimizado = false;
    atualizarPlayer();
  } else if (id === "pl-fs") {
    player.minimizado = false;
    atualizarPlayer();
    if (document.fullscreenElement) document.exitFullscreen();
    else if (elPlayer.requestFullscreen) elPlayer.requestFullscreen();
  } else if (id === "pl-x") pararPlayer();
  else if (id === "pl-mn") {
    player.minimizado = !player.minimizado;
    if (player.minimizado) player.expandido = false;
    atualizarPlayer();
  } else if (id === "pl-ln") {
    player.pedindoLink = !player.pedindoLink;
    atualizarPlayer();
  } else if (id === "pl-ok") usarLinkManual();
  else if (botao.classList.contains("pl-qi")) tocarFaixa(+botao.dataset.n, player.modo);
});

// Barra de progresso: arrastar muda a posição.
porId("pl-sk").addEventListener("input", (e) => {
  arrastandoBarra = true;
  irPara(+e.target.value);
});
porId("pl-sk").addEventListener("change", () => {
  arrastandoBarra = false;
});

// Volume: aplica no áudio e no player do YouTube.
porId("pl-vo").addEventListener("input", (e) => {
  const v = +e.target.value;
  audio.volume = v / 100;
  try {
    ytPlayer && ytPlayer.setVolume && ytPlayer.setVolume(v);
  } catch {
    // ignora
  }
});

// Atalhos de teclado: espaço = play/pause, setas = ±5 s, n = próxima, p = anterior.
// Ignorados quando o foco está num campo de texto, botão ou link.
addEventListener("keydown", (e) => {
  const alvo = e.target;
  if (player.indice < 0) return;
  if (alvo && alvo.closest && alvo.closest("input,textarea,select,button,a")) return;

  if (e.code === "Space") {
    e.preventDefault();
    tocarOuPausar();
  } else if (e.key === "ArrowRight") irPara(posicaoAtual() + 5);
  else if (e.key === "ArrowLeft") irPara(posicaoAtual() - 5);
  else if (e.key === "n") proxima();
  else if (e.key === "p") anterior();
});

// Botões de mídia do sistema (fone, tela de bloqueio).
if ("mediaSession" in navigator) {
  const ms = navigator.mediaSession;
  const definir = (acao, funcao) => {
    try {
      ms.setActionHandler(acao, funcao);
    } catch {
      // ação não suportada neste navegador
    }
  };
  definir("play", tocarOuPausar);
  definir("pause", tocarOuPausar);
  definir("nexttrack", proxima);
  definir("previoustrack", anterior);
}


/* =====================================================================
   7. FOTOS DOS ARTISTAS, BUSCA E MÚSICAS DA BANDA
   ===================================================================== */

// Fotos dos artistas já buscadas: { nome da banda: URL da foto }.
// null = busca em andamento ou sem foto; undefined = ainda não buscou.
const FOTOS = {};

// >>> FETCH 9  (GET /api/banda/<nome>)  -- AudioDB no lugar do Deezer
// Para usar a AudioDB, troque o corpo de buscarFoto() (mais abaixo) por:
//
//   const r = await fetch("/api/banda/" + encodeURIComponent(nome));
//   if (!r.ok) return "";
//   const banda = await r.json();
//   return banda.foto || "";            // strThumb / strArtistThumb da AudioDB
//
// Aí fotoDeezer() (esta função) pode ser apagada. A regex /^https:\/\/.../ que valida
// a URL deve continuar, porque a URL vai para dentro de um style="...url(...)".
// Busca os dados da banda pelo Flask (AudioDB). O servidor deve devolver
// JSON com a propriedade `foto` contendo uma URL https ou string vazia.
// >>> ALTERADO (10): renomeada de fotoDeezer() para fotoDaBanda(), porque agora
// ela consulta a AudioDB pelo Flask (o Deezer não é mais usado).
async function fotoDaBanda(nome) {
  try {
    const r = await fetch("/api/banda/" + encodeURIComponent(nome), {
      credentials: "same-origin",
    });
    if (!r.ok) return "";
    const banda = await r.json();
    return banda.foto || banda.strArtistThumb || "";
  } catch (erro) {
    console.error("Erro ao buscar foto da banda:", erro);
    return "";
  }
}

// Foto do artista: tenta AudioDB pelo Flask; se não achar, usa a capa do iTunes.
// Só aceita URLs https "limpas" para inserir no background-image.
async function buscarFoto(nome) {
  let url = await fotoDaBanda(nome); // >>> ALTERADO (10): novo nome
  if (!url) {
    try {
      const resultados = await buscarItunes(nome, 1, "artistTerm");
      url = resultados[0] ? resultados[0].c : "";
    } catch {
      // sem foto
    }
  }
  return /^https:\/\/[^\s"')]+$/.test(url) ? url : "";
}

// Aplica a foto já carregada em todos os cards daquela banda.
function pintarFoto(nome) {
  const url = FOTOS[nome];
  if (!url) return;
  document.querySelectorAll(".cv[data-n]").forEach((el) => {
    if (el.dataset.n === nome) {
      el.classList.add("ph");
      el.style.backgroundImage = "linear-gradient(180deg,#0000 35%,#000c),url(" + url + ")";
    }
  });
}

// Busca as fotos de todas as bandas visíveis que ainda não têm foto,
// com 4 buscas em paralelo.
async function carregarFotos() {
  const nomes = [...new Set([...document.querySelectorAll(".cv[data-n]")].map((el) => el.dataset.n))]
    .filter((nome) => FOTOS[nome] === undefined);
  nomes.forEach((nome) => (FOTOS[nome] = null)); // marca como "em andamento"

  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < nomes.length) {
      const nome = nomes[proximo++];
      FOTOS[nome] = await buscarFoto(nome);
      pintarFoto(nome);
    }
  };
  await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()]);
}

// HTML da seção "Mais Escutadas" (top de faixas visualizadas).
function htmlMaisEscutadas() {
  if (!maisEscutadasCarregadas || !maisEscutadas.length) {
    return `<div id="me-sec"></div>`;
  }
  const cards = maisEscutadas.map((faixa, posicao) => {
    const k = registrarFaixa(faixa);
    const capa = faixa.c
      ? `<img src="${escapar(faixa.c)}" alt="" class="me-capa">`
      : `<div class="me-capa me-sem-capa" style="--h:${matizPorNome(faixa.a)}"></div>`;
    return `<div class="me-card glass">
      <span class="me-pos">${posicao + 1}</span>
      ${capa}
      <div class="me-info">
        <b class="me-titulo">${escapar(faixa.t)}</b>
        <span class="me-artista m">${escapar(faixa.a)}</span>
        <span class="me-views m">👁 ${faixa.visualizacoes}</span>
      </div>
      <div class="me-acoes">
        <button class="chip" data-a="play" data-k="${k}" aria-label="Tocar prévia de 30 segundos">▶</button>
      </div>
    </div>`;
  }).join("");
  return `<div id="me-sec" class="me-sec">
    <h2 class="me-titulo-sec">🔥 Mais Escutadas</h2>
    <div class="me-lista">${cards}</div>
  </div>`;
}

// HTML da seção "Músicas no iTunes" (resultados da busca digitada).
function htmlResultadosBusca() {
  const texto = textoBusca.trim();
  if (texto.length < 2) return "";

  const linhas = resultadosBusca
    .map((faixa) => {
      const k = registrarFaixa(faixa);
      return `<div class="li">
        ${faixa.c ? `<img src="${escapar(faixa.c)}" alt="" width="44" height="44" style="border-radius:8px">` : ""}
        <div style="flex:1;min-width:150px"><b>${escapar(faixa.t)}</b>
          <p class="m">${escapar(faixa.a)}${faixa.al ? " · " + escapar(faixa.al) : ""}</p></div>
        <button class="chip" data-a="play" data-k="${k}">▶ 30 s</button>
        <button class="chip" data-a="play" data-k="${k}" data-m="full">▶ Completa</button>
        <button class="chip" data-a="addpl" data-k="${k}">＋ Playlist</button>
      </div>`;
    })
    .join("");

  return `<h2 style="margin:28px 0 12px;font-size:20px">Músicas no iTunes</h2>
    ${statusBusca ? `<p class="m">${escapar(statusBusca)}</p>` : ""}
    ${resultadosBusca.length ? `<div class="glass">${linhas}</div>` : ""}`;
}

// Redesenha só a área de resultados (sem renderizar a tela toda).
function pintarResultadosBusca() {
  const area = qs("#sr");
  if (area) area.innerHTML = htmlResultadosBusca();
}

// Pesquisa no iTunes enquanto o usuário digita. Espera 450 ms sem
// digitar (debounce) para não fazer uma requisição por letra.
function buscarMusicasDigitadas() {
  clearTimeout(timerBusca);
  const texto = textoBusca.trim();

  if (texto.length < 2) {
    resultadosBusca = [];
    statusBusca = "";
    pintarResultadosBusca();
    return;
  }

  statusBusca = "Buscando no iTunes...";
  resultadosBusca = [];
  pintarResultadosBusca();

  timerBusca = setTimeout(async () => {
    try {
      const resultados = await buscarItunes(texto, 12);
      if (texto !== textoBusca.trim()) return; // o texto mudou enquanto buscava
      resultadosBusca = resultados;
      statusBusca = resultados.length ? "" : "Nenhuma música encontrada no iTunes.";
    } catch {
      resultadosBusca = [];
      statusBusca = "Não foi possível consultar o iTunes. Verifique a internet.";
    }
    pintarResultadosBusca();
  }, 450);
}

// >>> FETCH 10  (GET /api/banda/<nome>)  -- dados reais da banda (AudioDB)
// Este é o lugar natural para buscar os dados da banda quando o modal abre.
// Dentro do `try`, além de buscarItunes(...), peça os dados ao Flask:
//
//   const r = await fetch("/api/banda/" + encodeURIComponent(nome));
//   if (r.ok && modal && modal.n === nome) {
//     modal.info = await r.json();       // { pais, ano, genero, descricao, foto, ... }
//   }
//
// Depois, em htmlModal() (ramo "band"), mostre modal.info no lugar de banda.pais,
// banda.ano e banda.ouvintes. A AudioDB NÃO tem número de ouvintes: combine com o colega
// se esse bloco sai da tela ou vira outra informação (ex.: gênero, estilo, descrição).
// Carrega as músicas da banda aberta no modal (até 10, sem repetir título).
// Só aceita resultados cujo artista contém a primeira palavra do nome da banda.
async function carregarMusicasDaBanda(nome) {
  modal.carregando = true;
  // FETCH 10: carrega os metadados AudioDB em paralelo. Eles ficam em
  // modal.info, mas a tela atual continua exibindo os dados do catálogo.
  // TODO: só substituir país/ano/descrição na interface quando o formato
  // final da resposta do Flask e os campos desejados forem definidos.
  fetch("/api/banda/" + encodeURIComponent(nome), { credentials: "same-origin" })
    .then(async (r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then((info) => {
      if (modal && modal.n === nome) modal.info = info;
    })
    .catch((erro) => console.error("Não foi possível carregar dados AudioDB:", erro));
  try {
    const resultados = await buscarItunes(nome, 25, "artistTerm");
    const primeiraPalavra = nome.toLowerCase().split(" ")[0];
    const vistos = new Set();
    const lista = resultados
      .filter(
        (x) =>
          x.a.toLowerCase().includes(primeiraPalavra) &&
          !vistos.has(x.t.toLowerCase()) &&
          vistos.add(x.t.toLowerCase())
      )
      .slice(0, 10);
    // Só atualiza se o modal ainda é o da mesma banda.
    if (modal && modal.n === nome) {
      modal.musicas = lista.length ? lista : null;
      modal.carregando = false;
      renderizar();
    }
  } catch {
    if (modal && modal.n === nome) {
      modal.carregando = false;
      renderizar();
    }
  }
}


/* =====================================================================
   8. TELAS (HTML gerado em JavaScript)
   ===================================================================== */

// Avatar do usuário: a foto, ou a inicial do nome num círculo.
const avatar = (u, classeExtra = "") =>
  u.foto
    ? `<img class="av ${classeExtra}" src="${u.foto}" alt="">`
    : `<span class="av ${classeExtra}">${escapar((u.nome.trim()[0] || "?").toUpperCase())}</span>`;

// Logo + nome "MusicMatch". O src da imagem é preenchido em renderizar().
const htmlLogo =
  `<div class="lg"><img data-logo alt="" width="38" height="38">` +
  `<span>Music<span class="g">Match</span></span></div>`;

// Redesenha a tela inteira conforme o estado atual.
// - sem usuário logado (ou adicionando conta) -> telaAuth
// - logado mas sem gêneros escolhidos (ou editando gêneros) -> telaGeneros
// - senão -> telaPrincipal (cabeçalho + página)
function renderizar() {
  const rolagem = scrollY; // guarda a rolagem para não pular para o topo
  const u = usuarioAtual();

  if (!u || adicionandoConta) telaAuth();
  else if (!u.gen.length || telaAtual === "gen") telaGeneros(u);
  else telaPrincipal(u);

  document.querySelectorAll("img[data-logo]").forEach((img) => (img.src = LOGO));
  carregarFotos();
  scrollTo(0, rolagem);
}

// Tela de login / cadastro.
function telaAuth() {
  const cadastro = abaAuth === "reg";
  // >>> ALTERADO (7)(8): removida a lista "Contas neste dispositivo" (as contas
  // não ficam mais no navegador) e trocado o aviso "salvas apenas neste navegador".
  raiz.innerHTML = `<main class="center"><div class="glass auth">
    <img data-logo class="biglogo" alt="Logo do MusicMatch">
    <h1>${cadastro ? "Criar conta" : "Entrar"}</h1>
    <form id="af">
      ${cadastro ? '<label>Nome<input name="nome" required maxlength="40" autocomplete="name"></label>' : ""}
      <label>E-mail<input name="email" type="email" required autocomplete="email"></label>
      <label>Senha<input name="pw" type="password" required minlength="6" autocomplete="${cadastro ? "new-password" : "current-password"}"></label>
      <p class="err" id="err" role="alert"></p>
      <button class="btn">${cadastro ? "Cadastrar" : "Entrar"}</button>
    </form>
    <p class="sw">${cadastro ? "Já tem conta?" : "Novo por aqui?"}
      <a href="#" data-a="authtab">${cadastro ? "Entrar" : "Criar conta"}</a>${adicionandoConta ? ' · <a href="#" data-a="cancel">Cancelar</a>' : ""}</p>
    <p class="m" style="margin-top:16px">Suas contas e dados ficam salvos no servidor.</p>
  </div></main>`;
}

// Tela de escolher gêneros musicais.
function telaGeneros(u) {
  raiz.innerHTML = `<main class="w">${htmlLogo}
    <div class="hd" style="margin-top:28px"><div>
      <h1>${u.gen.length ? "Seus gêneros" : "Escolha seus gêneros"}</h1>
      <p class="m">Escolha ao menos um. Você pode mudar depois.</p></div>
      ${u.gen.length ? '<button class="btn o" data-a="gback">Voltar</button>' : ""}
    </div>
    <div class="gg">${Object.keys(CATALOGO_POR_GENERO)
      .map(
        (g) => `<button class="glass gc" data-a="gt" data-g="${escapar(g)}" aria-pressed="${generosSelecionados.has(g)}">
          <b>${escapar(g)}</b><span class="m">${CATALOGO_POR_GENERO[g].length} bandas</span></button>`
      )
      .join("")}</div>
    <p style="margin-top:24px"><button class="btn" data-a="gsave" ${generosSelecionados.size ? "" : "disabled"}>
      ${u.gen.length ? "Salvar" : "Continuar"} (${generosSelecionados.size})</button></p></main>`;
}

// Estrutura principal: cabeçalho com menu + a página da vez.
function telaPrincipal(u) {
  const menu = [
    ["home", "Início"],
    ["lib", "Biblioteca"],
    ["pl", "Playlists"],
    ["hist", "Histórico"],
    ["prof", "Perfil"],
  ];
  // >>> ALTERADO (7): removido `outrasContas`, o "Trocar de conta" e o
  // "Adicionar outra conta" do menu (só existiam por causa do localStorage).

  raiz.innerHTML = `<header class="top">${htmlLogo}
    <nav class="nav" aria-label="Principal">
      ${menu.map(([v, rotulo]) => `<button class="nv" data-a="nav" data-v="${v}" ${telaAtual === v ? 'aria-current="page"' : ""}>${rotulo}</button>`).join("")}
    </nav>
    <div class="me">
      <button class="avb" data-a="menu" aria-label="Menu da conta" aria-expanded="${menuAberto}">${avatar(u)}</button>
      ${menuAberto
        ? `<div class="glass pop">
            <div class="row">${avatar(u)}<span><b>${escapar(u.nome)}</b><small>${escapar(u.email)}</small></span></div>
            <hr>
            <button class="row" data-a="logout">Sair da conta</button>
          </div>`
        : ""}
    </div></header>
    <main class="w">${htmlPagina(u)}</main>${modal ? htmlModal(u) : ""}`;
}

// Escolhe qual página desenhar com base em telaAtual.
function htmlPagina(u) {
  const paginas = { home: paginaInicio, lib: paginaBiblioteca, pl: paginaPlaylists, hist: paginaHistorico, prof: paginaPerfil };
  return paginas[telaAtual](u);
}

// Botões de ação de uma banda (favoritar, salvar, ver músicas).
function htmlAcoesBanda(banda, u) {
  const favorita = u.fav.includes(banda.nome);
  const salva = u.sav.includes(banda.nome);
  const nome = escapar(banda.nome);
  return `<button data-a="fav" data-n="${nome}" aria-pressed="${favorita}">♥ ${favorita ? "Favorita" : "Favoritar"}</button>
    <button data-a="sav" data-n="${nome}" aria-pressed="${salva}">${salva ? "✓ Salva" : "＋ Salvar"}</button>
    <button data-a="open" data-n="${nome}">♪ Músicas</button>`;
}

// Card de uma banda (usado na home e na biblioteca).
// Enquanto a foto não carrega, o fundo usa uma cor derivada do nome.
function htmlCardBanda(banda, u) {
  const foto = FOTOS[banda.nome];
  return `<article class="glass bc">
    <button class="cv${foto ? " ph" : ""}" style="--h:${matizPorNome(banda.nome)}${foto ? `;background-image:linear-gradient(180deg,#0000 35%,#000c),url(${foto})` : ""}" data-a="open" data-n="${escapar(banda.nome)}">${escapar(banda.nome)}</button>
    <div class="bi">
      <h3>${escapar(banda.nome)}</h3>
      <p class="m">${banda.genero} · ${banda.pais}</p>
      <p class="m">Fundada em <b>${banda.ano}</b> · <b>${formatarOuvintes(banda.ouvintes)}</b> de ouvintes</p>
      <p class="s">♪ ${escapar(banda.musicas[0])}</p>
      <div class="ac">${htmlAcoesBanda(banda, u)}</div>
    </div></article>`;
}

// Bandas visíveis na home: se há texto na busca, filtra pelo nome;
// senão, mostra as dos gêneros do usuário (respeitando o filtro de gênero).
function bandasVisiveis(u) {
  const busca = textoBusca.trim().toLowerCase();
  if (busca) return BANDAS.filter((b) => b.nome.toLowerCase().includes(busca));
  return BANDAS.filter((b) => u.gen.includes(b.genero) && (filtroGenero === "Todos" || b.genero === filtroGenero));
}

// HTML da grade de cards da home.
function htmlGradeBandas(u) {
  const lista = bandasVisiveis(u);
  return lista.length
    ? lista.map((b) => htmlCardBanda(b, u)).join("")
    : '<p class="m">Nenhuma banda encontrada no catálogo do site.</p>';
}

// >>> FETCH 11 (NÃO IMPLEMENTADO)
// Não há botão, ação ou componente de recomendação Gemini no front atual.
// Criar essa chamada exigiria adicionar uma funcionalidade nova e alterar a
// interface/lógica do front, contrariando o requisito de preservar o comportamento.
// TODO: implementar somente quando o front definir como as recomendações serão exibidas.
// Página inicial.
function paginaInicio(u) {
  return `<div class="hd"><div>
      <h1>Olá, ${escapar(u.nome.split(" ")[0])}</h1>
      <p class="m">Bandas e músicas sugeridas para você. Números de ouvintes são valores de exemplo.</p></div>
      <button class="btn o" data-a="moregen">＋ Adicionar gêneros</button></div>
    <input id="q" type="search" placeholder="Pesquisar banda ou música (catálogo do site e iTunes)" aria-label="Pesquisar banda" value="${escapar(textoBusca)}" style="margin:0 0 16px">
    ${htmlMaisEscutadas()}
    <div class="chips">${["Todos", ...u.gen].map((g) => `<button class="chip" data-a="flt" data-g="${escapar(g)}" aria-pressed="${filtroGenero === g}">${escapar(g)}</button>`).join("")}</div>
    <div class="grid" id="gr">${htmlGradeBandas(u)}</div>
    <div id="sr">${htmlResultadosBusca()}</div>`;
}

// Página da biblioteca (favoritas e salvas).
function paginaBiblioteca(u) {
  const lista = (abaBiblioteca === "fav" ? u.fav : u.sav).map(acharBanda).filter(Boolean);
  const abas = [
    ["fav", "♥ Favoritos", u.fav],
    ["sav", "Salvos", u.sav],
  ];
  return `<h1>Biblioteca</h1>
    <div class="chips" style="margin:16px 0">${abas.map(([t, rotulo, itens]) => `<button class="chip" data-a="tab" data-t="${t}" aria-pressed="${abaBiblioteca === t}">${rotulo} (${itens.length})</button>`).join("")}</div>
    ${lista.length
      ? `<div class="grid">${lista.map((b) => htmlCardBanda(b, u)).join("")}</div>`
      : '<p class="m">Nada por aqui ainda. Use Favoritar ou Salvar nas bandas da tela inicial.</p>'}`;
}

// Página de playlists: lista de playlists, ou o conteúdo de uma aberta.
function paginaPlaylists(u) {
  const aberta = playlistAberta && u.pl.find((p) => p.id === playlistAberta);

  // Playlist aberta: mostra as músicas.
  if (aberta) {
    const linhas = aberta.t
      .map((item, j) => {
        const faixa = resolverFaixa(item);
        const banda = acharBanda(faixa.a);
        const k = registrarFaixa(faixa);
        return `<div class="li"><div style="flex:1"><b>${escapar(faixa.t)}</b>
          <p class="m">${escapar(faixa.a)}${banda ? ` · fundada em ${banda.ano} · ${formatarOuvintes(banda.ouvintes)} de ouvintes` : ""}</p></div>
          <button class="chip" data-a="play" data-k="${k}">▶ 30 s</button>
          <button class="chip" data-a="play" data-k="${k}" data-m="full">▶ Completa</button>
          <button class="chip" data-a="trkdel" data-j="${j}">Remover</button></div>`;
      })
      .join("");
    return `<div class="hd"><div>
        <button class="lk" data-a="plback">← Playlists</button>
        <h1>${escapar(aberta.nome)}</h1><p class="m">${aberta.t.length} músicas</p></div>
        <button class="btn o" data-a="pldel" data-id="${aberta.id}">Excluir playlist</button></div>
      <div class="glass">${aberta.t.length ? linhas : '<p class="li m">Playlist vazia. Adicione músicas pelas bandas.</p>'}</div>`;
  }

  // Nenhuma aberta: formulário de nova playlist + lista.
  return `<h1>Playlists</h1>
    <form id="npl" class="hd" style="margin:16px 0">
      <input name="nome" placeholder="Nome da nova playlist" required maxlength="40" aria-label="Nome da playlist">
      <button class="btn">Criar playlist</button></form>
    ${u.pl.length
      ? `<div class="grid">${u.pl.map((p) => `<button class="glass pc" data-a="plopen" data-id="${p.id}"><b>${escapar(p.nome)}</b><span class="m">${p.t.length} músicas</span></button>`).join("")}</div>`
      : '<p class="m">Você ainda não criou playlists.</p>'}`;
}

// Página do histórico de bandas abertas.
function paginaHistorico(u) {
  const linhas = u.hist
    .map((h) => {
      const banda = acharBanda(h.n);
      if (!banda) return "";
      const quando = new Date(h.t).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      return `<div class="li"><div style="flex:1"><b>${escapar(banda.nome)}</b>
        <p class="m">${banda.genero} · fundada em ${banda.ano} · visto em ${quando}</p></div>
        <button class="chip" data-a="open" data-n="${escapar(banda.nome)}">Abrir</button></div>`;
    })
    .join("");
  return `<div class="hd"><h1>Histórico</h1>${u.hist.length ? '<button class="btn o" data-a="hclr">Limpar histórico</button>' : ""}</div>
    ${u.hist.length ? `<div class="glass">${linhas}</div>` : '<p class="m">Você ainda não abriu nenhuma banda.</p>'}`;
}

// Página de perfil (editar dados, gêneros, excluir conta).
function paginaPerfil(u) {
  return `<h1>Perfil</h1><div class="glass pfc">
    <div class="phr">${avatar(u, "l")}<div>
      <label class="btn o up">Alterar foto<input id="ph" type="file" accept="image/*" hidden></label>
      ${u.foto ? '<button class="lk" data-a="phrm">Remover foto</button>' : ""}</div></div>
    <form id="pf">
      <label>Nome<input name="nome" value="${escapar(u.nome)}" required maxlength="40"></label>
      <label>E-mail<input name="email" type="email" value="${escapar(u.email)}" required></label>
      <label>Bio<textarea name="bio" rows="3" maxlength="140">${escapar(u.bio)}</textarea></label>
      <label>Nova senha (opcional)<input name="pw" type="password" minlength="6" autocomplete="new-password"></label>
      <p class="err" id="err" role="alert"></p>
      <button class="btn">Salvar alterações</button></form>
    <h3>Gêneros</h3>
    <div class="chips">${u.gen.map((g) => `<span class="chip">${escapar(g)}</span>`).join("")}</div>
    <button class="btn o" data-a="moregen">Editar gêneros</button>
    <h3>Excluir conta</h3>
    <p class="m">Apaga seu perfil, favoritos, playlists e histórico.</p>
    <button class="btn d" data-a="delask">Excluir minha conta</button></div>`;
}

// Modais (janelas sobre a página). `modal.t` diz qual:
//   "band" -> detalhes e músicas de uma banda
//   "pl"   -> escolher playlist para adicionar uma música
//   "del"  -> confirmação de exclusão de conta
function htmlModal(u) {
  const banda = modal.n && acharBanda(modal.n);
  let conteudo = "";

  if (modal.t === "band") {
    // Músicas do iTunes se já carregaram; senão as 2 do catálogo.
    const lista = modal.musicas || banda.musicas.map((titulo) => ({ t: titulo, a: banda.nome, u: "" }));
    const foto = FOTOS[banda.nome];
    conteudo = `${foto ? `<img src="${foto}" alt="" style="width:100%;height:150px;object-fit:cover;border-radius:14px;margin-bottom:12px">` : ""}
      <h2>${escapar(banda.nome)}</h2>
      <p class="m">${banda.genero} · ${banda.pais}</p>
      <div class="st">
        <div><b class="g">${banda.ano}</b><span>Ano de fundação</span></div>
        <div><b class="g">${formatarOuvintes(banda.ouvintes)}</b><span>Ouvintes</span></div>
      </div>
      <h3>${modal.musicas ? "Músicas do iTunes" : "Músicas populares"}</h3>
      ${lista
        .map((faixa) => {
          const k = registrarFaixa(faixa);
          return `<div class="li" style="padding-left:0">
            ${faixa.c ? `<img src="${escapar(faixa.c)}" alt="" width="40" height="40" style="border-radius:8px">` : ""}
            <span style="flex:1;min-width:140px">♪ ${escapar(faixa.t)}</span>
            <button class="chip" data-a="play" data-k="${k}">▶ 30 s</button>
            <button class="chip" data-a="play" data-k="${k}" data-m="full">▶ Completa</button>
            <button class="chip" data-a="addpl" data-k="${k}">＋ Playlist</button></div>`;
        })
        .join("")}
      ${modal.carregando ? '<p class="m">Carregando músicas do iTunes...</p>' : ""}
      <div class="ac">${htmlAcoesBanda(banda, u)}</div>`;
  } else if (modal.t === "pl") {
    const faixa = FAIXAS[modal.k];
    conteudo = `<h2>Adicionar à playlist</h2>
      <p class="m">♪ ${escapar(faixa.t)} · ${escapar(faixa.a)}</p>
      ${u.pl.map((p) => `<button class="li rowb" data-a="doadd" data-id="${p.id}">${escapar(p.nome)}<span class="m">${p.t.length} músicas</span></button>`).join("")}
      <div class="hd" style="margin:14px 0 0">
        <input id="np" placeholder="Nova playlist" maxlength="40" aria-label="Nova playlist">
        <button class="btn" data-a="newadd">Criar e adicionar</button></div>`;
  } else {
    // >>> ALTERADO (8): texto não diz mais "neste navegador" (os dados estão no servidor).
    conteudo = `<h2>Excluir conta?</h2>
      <p class="m">Seu perfil, favoritos, playlists e histórico serão apagados. Isso não pode ser desfeito.</p>
      <div class="ac"><button class="btn o" data-a="close">Cancelar</button>
      <button class="btn d" data-a="delyes">Excluir definitivamente</button></div>`;
  }

  return `<div class="ov" data-a="ov"><div class="glass md" role="dialog" aria-modal="true">${conteudo}
    <button class="x" data-a="close" aria-label="Fechar">✕</button></div></div>`;
}


/* =====================================================================
   9. EVENTOS
   ===================================================================== */

// ---------------------------------------------------------------------
// CLIQUES: um único listener para o app inteiro.
// Cada botão tem data-a="nome-da-ação"; o switch abaixo trata cada uma.
// No fim, sempre salva e redesenha (salvarDados + renderizar).
// ---------------------------------------------------------------------
// >>> ALTERADO (1): lista das ações que realmente alteram dados do usuário.
// Antes, TODO clique (abrir menu, trocar de aba, filtrar gênero...) chamava
// salvarDados() e mandava um PUT /api/dados com a foto em base64. Agora só
// essas ações salvam. Se criar uma ação nova que altera dados, inclua-a aqui.
const ACOES_QUE_SALVAM = new Set([
  "fav", "sav", "open", "doadd", "newadd", "pldel", "trkdel", "hclr", "phrm", "gsave",
]);

raiz.addEventListener("click", (e) => {
  const alvo = e.target.closest("[data-a]");

  // Clique fora de qualquer botão: fecha o menu do avatar, se aberto.
  if (!alvo) {
    if (menuAberto) {
      menuAberto = false;
      renderizar();
    }
    return;
  }

  if (alvo.tagName === "A") e.preventDefault(); // links "#" não navegam

  const acao = alvo.dataset.a;
  const d = alvo.dataset;
  const u = usuarioAtual();

  // O fundo escuro do modal só fecha se o clique foi nele mesmo,
  // não em algo dentro da janela.
  if (acao === "ov" && e.target !== alvo) return;

  // >>> ALTERADO (7): removida a ação "pick" (clicar numa conta listada);
  // a lista "Contas neste dispositivo" não existe mais.

  switch (acao) {
    // ----- navegação e interface -----
    case "menu":
      menuAberto = !menuAberto;
      break;
    case "nav":
      telaAtual = d.v;
      playlistAberta = null;
      menuAberto = false;
      modal = null;
      scrollTo(0, 0);
      break;
    case "authtab":
      abaAuth = abaAuth === "reg" ? "login" : "reg";
      break;
    case "cancel":
      adicionandoConta = false;
      break;
    case "flt":
      filtroGenero = d.g;
      break;
    case "tab":
      abaBiblioteca = d.t;
      break;

    // ----- favoritar e salvar bandas -----
    // >>> FETCH (opcional)  (POST /api/favoritos  |  DELETE /api/favoritos/<banda>)
    // Já coberto pelo FETCH 2 (salvarDados). Se preferir rota fina:
    //   const ja = u.fav.includes(d.n);
    //   fetch("/api/favoritos/" + encodeURIComponent(d.n), { method: ja ? "DELETE" : "POST" });
    case "fav":
      alternarItem(u.fav, d.n);
      break;
    // >>> FETCH (opcional)  (POST/DELETE /api/salvos/<banda>)  -- mesma ideia do "fav".
    case "sav":
      alternarItem(u.sav, d.n);
      break;

    // ----- modais -----
    // >>> FETCH (opcional)  (POST /api/historico)  Corpo: { banda: d.n }
    // Registra a banda aberta no histórico do usuário. Já coberto pelo FETCH 2.
    // A busca de músicas e os dados da banda estão em carregarMusicasDaBanda() (FETCH 10).
    case "open": {
      // Registra no histórico (se não for a mesma banda da última vez),
      // mantém no máximo 60 itens e abre o modal da banda.
      if (!u.hist[0] || u.hist[0].n !== d.n) u.hist.unshift({ n: d.n, t: Date.now() });
      u.hist.length = Math.min(u.hist.length, 60);
      modal = { t: "band", n: d.n };
      carregarMusicasDaBanda(d.n);
      break;
    }
    case "addpl":
      modal = { t: "pl", k: +d.k };
      break;
    case "ov":
    case "close":
      modal = null;
      break;
    case "delask":
      modal = { t: "del" };
      break;

    // ----- tocar -----
    case "play": {
      // A fila é formada por todos os botões "30 s" do mesmo bloco
      // (modal ou lista). Assim "próxima" continua pela lista.
      const bloco = alvo.closest(".md,.glass");
      const indices = bloco
        ? [...new Set([...bloco.querySelectorAll('[data-a="play"]:not([data-m])')].map((x) => +x.dataset.k))]
        : [+d.k];
      const posicao = indices.indexOf(+d.k);
      modal = null;
      iniciarFila(indices.map((k) => FAIXAS[k]), posicao < 0 ? 0 : posicao, d.m);
      // Registra visualização da faixa clicada.
      registrarVisualizacao(FAIXAS[+d.k]);
      break;
    }

    // ----- playlists -----
    // >>> FETCH (opcional)  (POST /api/playlists/<id>/musicas)
    // Corpo: { t: faixa.t, a: faixa.a, u: faixa.u, c: faixa.c }. Já coberto pelo FETCH 2.
    case "doadd": {
      // Adiciona a música à playlist escolhida, sem duplicar.
      const playlist = u.pl.find((x) => x.id === d.id);
      const faixa = FAIXAS[modal.k];
      const jaExiste = playlist.t.some((item) => {
        const f = resolverFaixa(item);
        return f.t === faixa.t && f.a === faixa.a;
      });
      if (!jaExiste) playlist.t.push({ t: faixa.t, a: faixa.a, u: faixa.u || "", c: faixa.c || "" });
      mostrarAviso("Adicionada a “" + playlist.nome + "”");
      modal = null;
      break;
    }
    case "newadd": {
      // Cria uma playlist nova já com a música.
      const nome = qs("#np").value.trim();
      if (!nome) return;
      const faixa = FAIXAS[modal.k];
      u.pl.push({
        id: Date.now().toString(36),
        nome,
        t: [{ t: faixa.t, a: faixa.a, u: faixa.u || "", c: faixa.c || "" }],
      });
      mostrarAviso("Playlist “" + nome + "” criada");
      modal = null;
      break;
    }
    case "plopen":
      playlistAberta = d.id;
      break;
    case "plback":
      playlistAberta = null;
      break;
    // >>> FETCH (opcional)  (DELETE /api/playlists/<id>)
    //   fetch("/api/playlists/" + d.id, { method: "DELETE" });
    case "pldel":
      u.pl = u.pl.filter((x) => x.id !== d.id);
      playlistAberta = null;
      mostrarAviso("Playlist excluída");
      break;
    // >>> FETCH (opcional)  (DELETE /api/playlists/<id>/musicas/<posicao>)
    //   fetch("/api/playlists/" + playlistAberta + "/musicas/" + d.j, { method: "DELETE" });
    case "trkdel":
      u.pl.find((x) => x.id === playlistAberta).t.splice(+d.j, 1);
      break;

    // ----- histórico e foto -----
    // >>> FETCH (opcional)  (DELETE /api/historico)
    //   fetch("/api/historico", { method: "DELETE" });
    case "hclr":
      u.hist = [];
      break;
    case "phrm":
      u.foto = "";
      break;

    // ----- gêneros -----
    case "moregen":
      generosSelecionados = new Set(u.gen);
      telaAtual = "gen";
      menuAberto = false;
      break;
    case "gt":
      if (generosSelecionados.has(d.g)) generosSelecionados.delete(d.g);
      else generosSelecionados.add(d.g);
      break;
    // >>> FETCH (opcional)  (PUT /api/generos)  Corpo: { gen: [...] }. Já coberto pelo FETCH 2.
    case "gsave":
      if (!generosSelecionados.size) return;
      u.gen = [...generosSelecionados];
      if (!u.gen.includes(filtroGenero)) filtroGenero = "Todos";
      telaAtual = "home";
      break;
    case "gback":
      telaAtual = "home";
      break;

    // ----- contas -----
    // >>> ALTERADO (7): removidos os cases "switch" (trocar de conta) e "addacc"
    // (adicionar outra conta): a conta é única e vive no servidor.
    // >>> FETCH 5  (POST /api/logout)
    // Antes de limpar `dados.a`, avise o servidor para apagar a sessão:
    //   fetch("/api/logout", { method: "POST" });
    // (não precisa de await; não há nada para esperar)
    case "logout":
      fetch("/api/logout", {
        method: "POST",
        credentials: "same-origin",
      }).then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
      }).catch((erro) => {
        console.error("Erro ao encerrar sessão:", erro);
        mostrarAviso("Não foi possível confirmar o encerramento da sessão no servidor.");
      });

      pararPlayer();
      // >>> ALTERADO (4): antes só fazia `dados.a = null`, e o usuário ficava em
      // `dados.u` (aparecia como "conta neste dispositivo"). Agora zera tudo.
      dados = { u: [], a: null };
      adicionandoConta = false;
      abaAuth = "login";
      menuAberto = false;
      break;
    // >>> FETCH 6  (DELETE /api/conta)
    // Excluir a conta tem que apagar no servidor também:
    //   fetch("/api/conta", { method: "DELETE" });
    // O Flask apaga o usuário (e favoritos, playlists, histórico) e encerra a sessão.
    // >>> REMOVER: a linha `dados.u = dados.u.filter(...)` deixa de ser necessária,
    // porque o navegador só conhece o usuário logado.
    case "delyes":
      fetch("/api/conta", {
        method: "DELETE",
        credentials: "same-origin",
      }).then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
      }).catch((erro) => {
        console.error("Erro ao excluir conta:", erro);
        mostrarAviso("Não foi possível confirmar a exclusão da conta no servidor.");
      });

      // >>> ALTERADO (4): zera `dados` por completo (antes deixava o usuário
      // excluído em `dados.u`).
      dados = { u: [], a: null };
      modal = null;
      telaAtual = "home";
      abaAuth = "login";
      break;
    }
  // >>> ALTERADO (1): só salva quando a ação mudou dados (ver ACOES_QUE_SALVAM).
  // Nos logouts/exclusões `usuarioAtual()` é undefined e salvarDados() não faz nada.
  if (ACOES_QUE_SALVAM.has(acao)) salvarDados();
  renderizar();
});

// ---------------------------------------------------------------------
// FORMULÁRIOS: login/cadastro (af), perfil (pf) e nova playlist (npl).
// ---------------------------------------------------------------------
raiz.addEventListener("submit", async (e) => {
  e.preventDefault();
  const idForm = e.target.id;
  const campos = Object.fromEntries(new FormData(e.target)); // {nome: valor, ...}
  const mostrarErro = (texto) => {
    qs("#err").textContent = texto;
  };

  // >>> FETCH 3  (POST /api/login  e  POST /api/register)
  // Hoje: o hash da senha é feito aqui e comparado com `dados.u` (no navegador).
  // Com o Flask: mande e-mail e senha EM TEXTO (a conexão deve ser HTTPS em produção);
  // quem faz o hash (werkzeug/bcrypt) e confere é o servidor. Apague a chamada hashSenha().
  //
  //   const rota = abaAuth === "reg" ? "/api/register" : "/api/login";
  //   const r = await fetch(rota, {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify({ nome: campos.nome, email, pw: campos.pw }),
  //   });
  //   const json = await r.json();
  //   if (!r.ok) return mostrarErro(json.erro);            // ex.: "E-mail ou senha incorretos."
  //   dados = { u: [json], a: json.id };                   // json = usuário logado
  //   if (abaAuth === "reg") generosSelecionados = new Set();
  //
  // Códigos que o Flask deve usar: 201 cadastro ok, 200 login ok,
  // 409 e-mail já cadastrado, 401 senha errada. Sempre com {"erro": "..."} no corpo.
  // >>> REMOVER: a lista "Contas neste dispositivo" (data-a="pick"), o "Trocar de conta"
  // (case "switch") e o "Adicionar outra conta" (case "addacc"): só existem porque
  // várias contas ficavam no mesmo navegador.
  if (idForm === "af") {
    const email = String(campos.email || "").trim().toLowerCase();
    const rota = abaAuth === "reg" ? "/api/register" : "/api/login";

    // >>> ALTERADO (3): try/catch. Sem ele, se o Flask estivesse fora do ar (ou
    // respondesse uma página HTML de erro 500), o fetch/r.json() lançava exceção
    // e o botão "Entrar" não fazia nada, sem mensagem.
    let r, json;
    try {
      r = await fetch(rota, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: campos.nome, email, pw: campos.pw }),
      });
      json = await r.json();
    } catch (erro) {
      console.error("Erro no login/cadastro:", erro);
      return mostrarErro("Não foi possível falar com o servidor. Tente de novo.");
    }
    if (!r.ok) return mostrarErro((json && json.erro) || "Não foi possível concluir. Tente de novo.");

    // >>> ALTERADO (2): normaliza o usuário recebido (como carregarDados() faz).
    dados = { u: [normalizarUsuario(json)], a: json.id };
    if (abaAuth === "reg") generosSelecionados = new Set();

    // >>> ALTERADO (5): estas linhas existiam no código original e se perderam
    // na integração. Sem elas, quem saía estando em "Perfil" voltava direto ao Perfil.
    adicionandoConta = false;
    telaAtual = "home";
    filtroGenero = "Todos";
  // >>> FETCH 4  (PUT /api/perfil)
  // Dentro deste bloco, no lugar de Object.assign(u, ...) e do hash da nova senha:
  //   const r = await fetch("/api/perfil", {
  //     method: "PUT",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify({ nome: campos.nome, email, bio: campos.bio, pw: campos.pw || null }),
  //   });
  //   const json = await r.json();
  //   if (!r.ok) return mostrarErro(json.erro);            // 409 = e-mail já em uso
  //   Object.assign(u, json);                               // atualiza o usuário em memória
  } else if (idForm === "pf") {
    // ----- editar perfil -----
    const u = usuarioAtual();
    const email = campos.email.trim().toLowerCase();
    // >>> ALTERADO (3): removida a checagem local "e-mail já em uso" (dados.u só tem
    // o usuário logado, então ela nunca achava nada; quem decide é o servidor, que
    // responde 409) e adicionado try/catch para erro de rede / resposta não-JSON.
    let r, json;
    try {
      r = await fetch("/api/perfil", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: campos.nome, email, bio: campos.bio, pw: campos.pw || null }),
      });
      json = await r.json();
    } catch (erro) {
      console.error("Erro ao salvar perfil:", erro);
      return mostrarErro("Não foi possível falar com o servidor. Tente de novo.");
    }
    if (!r.ok) return mostrarErro((json && json.erro) || "Não foi possível salvar o perfil.");
    Object.assign(u, json);
    // >>> ALTERADO (6): toast que existia no código original e se perdeu.
    mostrarAviso("Perfil atualizado");
  // >>> FETCH (opcional)  (POST /api/playlists)
  // Se NÃO usar o salvarDados() central, criar playlist vira:
  //   const r = await fetch("/api/playlists", {
  //     method: "POST", headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify({ nome: campos.nome.trim() }),
  //   });
  //   usuarioAtual().pl.push(await r.json());              // {id, nome, t: []}
  } else if (idForm === "npl") {
    // ----- nova playlist -----
    usuarioAtual().pl.push({ id: Date.now().toString(36), nome: campos.nome.trim(), t: [] });
  }

  // >>> ALTERADO (1): login/cadastro já vêm do servidor e o perfil é salvo por
  // /api/perfil; só a criação de playlist ("npl") precisa do PUT /api/dados.
  if (idForm === "npl") salvarDados();
  renderizar();
});

// ---------------------------------------------------------------------
// TROCA DE FOTO DE PERFIL: lê a imagem, recorta o centro em quadrado,
// reduz para 200x200 e guarda como JPEG em texto (data URL).
// ---------------------------------------------------------------------
raiz.addEventListener("change", (e) => {
  if (e.target.id !== "ph" || !e.target.files[0]) return;

  const leitor = new FileReader();
  leitor.onload = () => {
    const imagem = new Image();
    imagem.onload = () => {
      const tamanho = 200;
      const lado = Math.min(imagem.width, imagem.height); // lado do quadrado central
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = tamanho;
      canvas
        .getContext("2d")
        .drawImage(imagem, (imagem.width - lado) / 2, (imagem.height - lado) / 2, lado, lado, 0, 0, tamanho, tamanho);
      usuarioAtual().foto = canvas.toDataURL("image/jpeg", 0.85);
      salvarDados();
      renderizar();
      mostrarAviso("Foto atualizada");
    };
    imagem.src = leitor.result;
  };
  leitor.readAsDataURL(e.target.files[0]);
});

// ---------------------------------------------------------------------
// BUSCA: a cada letra digitada, atualiza a grade de bandas na hora e
// dispara a busca de músicas no iTunes (com espera, ver
// buscarMusicasDigitadas).
// ---------------------------------------------------------------------
raiz.addEventListener("input", (e) => {
  if (e.target.id === "q") {
    textoBusca = e.target.value;
    qs("#gr").innerHTML = htmlGradeBandas(usuarioAtual());
    buscarMusicasDigitadas();
  }
});

// ESC fecha o modal e o menu.
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (modal || menuAberto)) {
    modal = null;
    menuAberto = false;
    renderizar();
  }
});

// Desenha a tela pela primeira vez.
carregarDados().then((d) => { dados = d; carregarMaisEscutadas(); renderizar(); });