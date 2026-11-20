"""
repositorio.py - camada de armazenamento do MusicMatch.

>>> VERSÃO PROVISÓRIA, EM MEMÓRIA. <<<
Os dados somem quando o Flask reinicia (com --debug isso acontece a cada
arquivo salvo). Serve para testar o front enquanto o banco não existe.

PARA QUEM FOR FAZER O BANCO
---------------------------
Troque o corpo das funções abaixo (e só delas). O app.py NÃO acessa o
armazenamento de nenhum outro jeito, então nada além deste arquivo muda.
Mantenha EXATAMENTE os nomes, os argumentos e o que cada função devolve.

Formato do usuário (dict) devolvido pelas funções:

    {
      "id":         int,          # único, gerado pelo banco
      "nome":       str,          # 1 a 40 caracteres
      "email":      str,          # já em minúsculas; ÚNICO (UNIQUE no banco)
      "senha_hash": str,          # hash do werkzeug (generate_password_hash)
      "foto":       str,          # "" ou data URL "data:image/jpeg;base64,..."
      "bio":        str,          # até 140 caracteres
      "gen":        list[str],    # gêneros escolhidos
      "fav":        list[str],    # nomes de bandas favoritas
      "sav":        list[str],    # nomes de bandas salvas
      "pl":         list[dict],   # playlists: {"id": str, "nome": str, "t": [faixas]}
      "hist":       list[dict],   # histórico: {"n": nome da banda, "t": timestamp em ms}
    }

Sugestão para o banco: uma tabela `usuarios` com id, nome, email (UNIQUE),
senha_hash, foto, bio, e as cinco listas (gen, fav, sav, pl, hist) em colunas
de TEXTO guardando JSON (json.dumps / json.loads). Assim o formato que o front
espera volta idêntico, sem precisar quebrar as playlists em várias tabelas.
Os ids de playlist são TEXTO (o front compara com data-id). Não troque por inteiro.

Regras que o banco precisa garantir:
  * e-mail único: levantar EmailJaCadastrado (inclusive em disputa entre
    dois pedidos ao mesmo tempo, ex.: capturando IntegrityError);
  * as funções devolvem COPIAS; o app nunca altera o dict devolvido
    esperando que isso grave algo;
  * quem não existe devolve None / False (o app decide o que responder).
"""
import copy
import threading


class EmailJaCadastrado(Exception):
    """O e-mail já pertence a outra conta."""


_lock = threading.Lock()   # o servidor de desenvolvimento atende pedidos em threads
_usuarios = {}             # id -> dict do usuário
_proximo_id = 1


def criar_usuario(nome, email, senha_hash):
    """Cria o usuário (listas vazias, foto e bio vazias) e devolve o dict.
    Levanta EmailJaCadastrado se o e-mail já existe."""
    global _proximo_id
    with _lock:
        if any(u["email"] == email for u in _usuarios.values()):
            raise EmailJaCadastrado(email)
        usuario = {
            "id": _proximo_id, "nome": nome, "email": email,
            "senha_hash": senha_hash, "foto": "", "bio": "",
            "gen": [], "fav": [], "sav": [], "pl": [], "hist": [],
        }
        _usuarios[_proximo_id] = usuario
        _proximo_id += 1
        return copy.deepcopy(usuario)


def buscar_por_email(email):
    """Devolve o usuário com esse e-mail (já em minúsculas) ou None."""
    with _lock:
        for usuario in _usuarios.values():
            if usuario["email"] == email:
                return copy.deepcopy(usuario)
    return None


def buscar_por_id(usuario_id):
    """Devolve o usuário com esse id ou None."""
    with _lock:
        usuario = _usuarios.get(usuario_id)
        return copy.deepcopy(usuario) if usuario else None


def atualizar_perfil(usuario_id, nome, email, bio, senha_hash=None):
    """Atualiza nome, e-mail e bio. Se senha_hash não for None, troca a senha.
    Levanta EmailJaCadastrado se o e-mail já é de OUTRA conta (o próprio
    usuário pode manter o e-mail que já tem). Devolve o usuário atualizado,
    ou None se o id não existe."""
    with _lock:
        usuario = _usuarios.get(usuario_id)
        if not usuario:
            return None
        if any(u["email"] == email and u["id"] != usuario_id for u in _usuarios.values()):
            raise EmailJaCadastrado(email)
        usuario.update(nome=nome, email=email, bio=bio)
        if senha_hash is not None:
            usuario["senha_hash"] = senha_hash
        return copy.deepcopy(usuario)


def salvar_dados(usuario_id, dados):
    """Substitui gen, fav, sav, pl, hist e foto pelos valores de `dados`
    (já validados pelo app.py). Devolve True, ou False se o id não existe."""
    with _lock:
        usuario = _usuarios.get(usuario_id)
        if not usuario:
            return False
        for campo in ("gen", "fav", "sav", "pl", "hist", "foto"):
            usuario[campo] = copy.deepcopy(dados[campo])
        return True


def apagar_usuario(usuario_id):
    """Apaga o usuário e tudo dele. Devolve True, ou False se não existia."""
    with _lock:
        return _usuarios.pop(usuario_id, None) is not None


# ---------------------------------------------------------------------
# Visualizações de faixas
# ---------------------------------------------------------------------
# Chave: "titulo|artista" em minúsculas.
# Valor: { "t": titulo, "a": artista, "c": capa, "u": preview_url, "visualizacoes": int }
_visualizacoes: dict = {}
_vis_lock = threading.Lock()


def incrementar_visualizacao(titulo: str, artista: str, capa: str = "", url: str = "") -> int:
    """Incrementa a contagem de visualizações da faixa e devolve o novo total.
    Se a faixa ainda não existe no registro, cria com valor 1."""
    chave = f"{titulo.lower()}|{artista.lower()}"
    with _vis_lock:
        if chave not in _visualizacoes:
            _visualizacoes[chave] = {"t": titulo, "a": artista, "c": capa, "u": url, "visualizacoes": 0}
        reg = _visualizacoes[chave]
        # Atualiza capa e URL se foram informadas e ainda estão vazias.
        if capa and not reg["c"]:
            reg["c"] = capa
        if url and not reg["u"]:
            reg["u"] = url
        reg["visualizacoes"] += 1
        return reg["visualizacoes"]


def listar_mais_visualizadas(limite: int = 10) -> list:
    """Devolve as `limite` faixas mais visualizadas, em ordem decrescente."""
    with _vis_lock:
        ordenadas = sorted(_visualizacoes.values(), key=lambda x: x["visualizacoes"], reverse=True)
        return [dict(r) for r in ordenadas[:limite]]